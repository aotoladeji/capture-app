const express = require('express');
const router = express.Router();
const db = require('../config/database');
const excelController = require('../controllers/excelController');
const captureController = require('../controllers/captureController');
const authController = require('../controllers/authController');
const { verifyAdmin } = require('../middleware/authMiddleware');
const { verifyApiKey, verifyAdmin: verifyAdminOrStaff } = require('../middleware/auth');
const { uploadExcel, uploadImage } = require('../middleware/upload');

// Excel routes
router.post('/excel/upload', uploadExcel.single('excelFile'), excelController.uploadExcel);
router.get('/excel/files', excelController.getExcelFiles);
router.put('/excel/activate/:fileId', excelController.activateFile);
router.delete('/excel/files/:fileId', excelController.deleteFile);
// Fallbacks for environments where nested dynamic segments under /api/excel can misroute.
router.put('/excel/activate', (req, res) => {
  req.params.fileId = req.body?.fileId || req.query?.fileId;
  return excelController.activateFile(req, res);
});
router.delete('/excel/files', (req, res) => {
  req.params.fileId = req.query?.fileId || req.body?.fileId;
  return excelController.deleteFile(req, res);
});
router.get('/excel/template', excelController.downloadTemplate);

// Authentication
router.post('/authenticate', excelController.authenticate);

// User creation (after login)
router.post('/create-user', captureController.createUser);

// Capture routes
router.post('/capture/signature', captureController.saveSignature);
router.post('/capture/fingerprint', captureController.saveFingerprint);
router.post('/capture/passport', uploadImage.single('photo'), captureController.savePassportPhoto);
router.post('/generate-idcard', captureController.generateIDCardForUser);

// External verification endpoints (protected by API key)
// POST /api/verify/fingerprint  — exact-match a scanned template against the DB
// GET  /api/verify/fingerprint/templates/:userId — fetch stored templates for SDK-level matching
router.post('/verify/fingerprint', verifyApiKey, captureController.verifyFingerprint);
router.get('/verify/fingerprint/templates/:userId', verifyApiKey, captureController.getFingerprintTemplates);

// Admin/staff auth
router.post('/admin/login', authController.login);
router.post('/admin/change-password', verifyAdmin, authController.changePassword);

// Staff dashboard - pending registrations
router.get('/staff/pending', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT ON (u.id)
        u.id,
        u.surname,
        u.other_names,
        u.user_type,
        u.matric_no,
        u.staff_id,
        u.department,
        u.faculty,
        u.status,
        u.created_at AS captured_at,
        sn.status as notification_status
      FROM id_card_users u
      LEFT JOIN staff_notifications sn ON u.id = sn.user_id
      WHERE u.status = 'pending_approval'
      ORDER BY u.id, sn.created_at DESC
    `);
    res.json({ success: true, pending: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Approve registration — update status, generate print image, and store it
router.post('/staff/approve/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch user data and related excel row needed for print
    const result = await db.query(`
      SELECT u.*, ed.card_number, ed.session
      FROM id_card_users u
      LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    // Generate printable ID card image WITHOUT background (for printing on pre-printed cards)
    let idCardBuffer = null;
    try {
      const generateIDCardOverlay = require('../utils/idCardGenerator');
      idCardBuffer = await generateIDCardOverlay(user, false); // false = no background
      console.log(`✅ Generated ID card WITHOUT background for user ${userId}`);
    } catch (genErr) {
      console.error('Error generating ID card image:', genErr);
      // proceed — still mark approved but without image
    }

    // Update record: set approved and attach generated id_card_image if available
    if (idCardBuffer) {
      await db.query(
        'UPDATE id_card_users SET status = $1, approved_at = NOW(), id_card_image = $2 WHERE id = $3',
        ['approved', idCardBuffer, userId]
      );
    } else {
      await db.query(
        'UPDATE id_card_users SET status = $1, approved_at = NOW() WHERE id = $2',
        ['approved', userId]
      );
    }

    res.json({ success: true, message: 'Registration approved' });
  } catch (error) {
    console.error('Error approving registration:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ... other routes ...

// Get printable data for a single user (for preview or printing)
router.get('/printing/data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await db.query(`
      SELECT u.id, u.surname, u.other_names, u.matric_no, u.staff_id,
             u.department, u.faculty, u.level, u.marital_status, u.birth_date,
             u.hall, u.passport_photo, u.signature,
             ed.card_number, ed.session
      FROM id_card_users u
      LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
      WHERE u.id = $1 OR u.excel_data_id = $1
      ORDER BY u.created_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];
    const response = {
      success: true,
      data: {
        ...user,
        passport_photo: user.passport_photo ? user.passport_photo.toString('base64') : null,
        signature: user.signature ? user.signature.toString('base64') : null,
      }
    };
    res.json(response);
  } catch (error) {
    console.error('Error fetching printable data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reject registration
router.post('/staff/reject/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await db.query('UPDATE id_card_users SET status = $1 WHERE id = $2', ['rejected', userId]);
    res.json({ success: true, message: 'Registration rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reset a single candidate so they can redo capture.
// Accepts either userId or identifier (matric_no/staff_id).
router.post('/staff/reset-candidate', verifyAdminOrStaff, async (req, res) => {
  try {
    const { userId, identifier } = req.body || {};
    if (!userId && !identifier) {
      return res.status(400).json({
        success: false,
        message: 'Provide userId or identifier'
      });
    }

    const lookup = userId
      ? await db.query(
          `SELECT id, surname, other_names, matric_no, staff_id, status
           FROM id_card_users
           WHERE id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [userId]
        )
      : await db.query(
          `SELECT id, surname, other_names, matric_no, staff_id, status
           FROM id_card_users
           WHERE matric_no = $1 OR staff_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [identifier]
        );

    if (lookup.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    const candidate = lookup.rows[0];

    // Delete this candidate only. Related fingerprints/notifications are removed by FK cascade.
    await db.query('DELETE FROM id_card_users WHERE id = $1', [candidate.id]);

    return res.json({
      success: true,
      message: 'Candidate reset successfully. They can login and recapture.',
      candidate: {
        id: candidate.id,
        name: `${candidate.surname || ''} ${candidate.other_names || ''}`.trim(),
        identifier: candidate.matric_no || candidate.staff_id,
        previousStatus: candidate.status
      }
    });
  } catch (error) {
    console.error('Reset candidate error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Serve ID card
router.get('/idcard/:userId', async (req, res) => {
  try {
    const result = await db.query('SELECT id_card_image FROM id_card_users WHERE id = $1', [req.params.userId]);
    if (result.rows[0]?.id_card_image) {
      res.set('Content-Type', 'image/png');
      res.send(result.rows[0].id_card_image);
    } else {
      res.status(404).send('ID card not found');
    }
  } catch (error) {
    res.status(500).send('Error retrieving ID card');
  }
});

// Preview/regenerate ID card (for testing)
router.get('/idcard/preview/:userId', async (req, res) => {
  try {
    const generateIDCardOverlay = require('../utils/idCardGenerator');
    const result = await db.query(`
      SELECT u.*, ed.card_number, ed.session
      FROM id_card_users u
      LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
      WHERE u.id = $1
    `, [req.params.userId]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const user = result.rows[0];
    // Generate WITH background for preview
    const idCardBuffer = await generateIDCardOverlay(user, true);
    
    res.set('Content-Type', 'image/png');
    res.send(idCardBuffer);
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).send('Error generating ID card preview');
  }
});

// Preview WITHOUT background (for print testing)
router.get('/idcard/preview-print/:userId', async (req, res) => {
  try {
    const generateIDCardOverlay = require('../utils/idCardGenerator');
    const result = await db.query(`
      SELECT u.*, ed.card_number, ed.session
      FROM id_card_users u
      LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
      WHERE u.id = $1
    `, [req.params.userId]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const user = result.rows[0];
    // Generate WITHOUT background for printing
    const idCardBuffer = await generateIDCardOverlay(user, false);
    
    res.set('Content-Type', 'image/png');
    res.send(idCardBuffer);
  } catch (error) {
    console.error('Error generating print preview:', error);
    res.status(500).send('Error generating ID card print preview');
  }
});

// Mark card as printed (called by management system)
router.post('/printing/mark-printed/:userId', async (req, res) => {
  try {
    await db.query(
      'UPDATE id_card_users SET status = $1, printed_at = NOW() WHERE id = $2',
      ['printed', req.params.userId]
    );
    res.json({ success: true, message: 'Card marked as printed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark card as collected (called by management system)
router.post('/printing/mark-collected/:userId', async (req, res) => {
  try {
    await db.query(
      'UPDATE id_card_users SET status = $1, collected_at = NOW() WHERE id = $2',
      ['collected', req.params.userId]
    );
    res.json({ success: true, message: 'Card marked as collected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get count of approvals today
router.get('/staff/approved-today', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*) FROM id_card_users 
       WHERE status = 'approved' 
       AND DATE(approved_at) = CURRENT_DATE`
    );
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all approved cards (for printing app)
router.get('/printing/queue', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, surname, other_names, matric_no, approved_at 
       FROM id_card_users 
       WHERE status = 'approved' 
       ORDER BY approved_at DESC`
    );
    res.json({ success: true, cards: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all approved cards (for printing app)
router.get('/printing/approved', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.surname, u.other_names, u.matric_no, u.staff_id,
             u.department, u.faculty, u.level, u.marital_status, u.birth_date,
             u.hall, u.passport_photo, u.signature,
             ed.card_number, ed.session
      FROM id_card_users u
      LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
      WHERE u.status = 'approved'
      ORDER BY u.id DESC
    `);
    // Convert binary images to base64 for easy transmission
    const cards = result.rows.map(row => ({
      ...row,
      passport_photo: row.passport_photo ? row.passport_photo.toString('base64') : null,
      signature: row.signature ? row.signature.toString('base64') : null,
    }));
    res.json({ success: true, cards });
  } catch (error) {
    console.error('Error fetching approved cards:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// ============================================
// INTEGRATION ROUTES FOR MANAGEMENT SYSTEM
// ============================================

// Get all approved cards for printing (called by management system)
router.get('/api/printing/approved', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.surname, u.other_names, u.matric_no, u.staff_id,
             u.department, u.faculty, u.level, u.marital_status, u.birth_date,
             u.hall, u.passport_photo, u.signature, u.status,
             ed.card_number, ed.session
      FROM id_card_users u
      LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
      WHERE u.status = 'approved'
      ORDER BY u.approved_at DESC
    `);
    
    // Convert binary images to base64 for transmission
    const cards = result.rows.map(row => ({
      ...row,
      passport_photo: row.passport_photo ? row.passport_photo.toString('base64') : null,
      signature: row.signature ? row.signature.toString('base64') : null,
    }));
    
    res.json({ success: true, cards });
  } catch (error) {
    console.error('Error fetching approved cards:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark card as printed (called by management system after printing)
router.post('/api/printing/mark-printed/:userId', async (req, res) => {
  try {
    await db.query(
      'UPDATE id_card_users SET status = $1, printed_at = NOW() WHERE id = $2',
      ['printed', req.params.userId]
    );
    res.json({ success: true, message: 'Card marked as printed' });
  } catch (error) {
    console.error('Error marking as printed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark card as collected (called by management system after collection)
router.post('/api/printing/mark-collected/:userId', async (req, res) => {
  try {
    await db.query(
      'UPDATE id_card_users SET status = $1, collected_at = NOW() WHERE id = $2',
      ['collected', req.params.userId]
    );
    res.json({ success: true, message: 'Card marked as collected' });
  } catch (error) {
    console.error('Error marking as collected:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// INTEGRATION ROUTES - Add these at the end before module.exports

// Get all approved cards
router.get('/printing/approved', async (req, res) => {
  try {
    console.log('Fetching approved cards...');
    const result = await db.query(`
      SELECT u.id, u.surname, u.other_names, u.matric_no, u.staff_id,
             u.department, u.faculty, u.level, u.marital_status, u.birth_date,
             u.hall, u.passport_photo, u.signature, u.status,
             ed.card_number, ed.session
      FROM id_card_users u
      LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
      WHERE u.status = 'approved'
      ORDER BY u.approved_at DESC
    `);
    
    console.log(`Found ${result.rows.length} approved cards`);
    
    const cards = result.rows.map(row => ({
      ...row,
      passport_photo: row.passport_photo ? row.passport_photo.toString('base64') : null,
      signature: row.signature ? row.signature.toString('base64') : null,
    }));
    
    res.json({ success: true, cards });
  } catch (error) {
    console.error('Error fetching approved cards:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark as printed
router.post('/printing/mark-printed/:userId', async (req, res) => {
  try {
    console.log(`Marking card ${req.params.userId} as printed`);
    await db.query(
      'UPDATE id_card_users SET status = $1, printed_at = NOW() WHERE id = $2',
      ['printed', req.params.userId]
    );
    res.json({ success: true, message: 'Card marked as printed' });
  } catch (error) {
    console.error('Error marking as printed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark as collected
router.post('/printing/mark-collected/:userId', async (req, res) => {
  try {
    console.log(`Marking card ${req.params.userId} as collected`);
    await db.query(
      'UPDATE id_card_users SET status = $1, collected_at = NOW() WHERE id = $2',
      ['collected', req.params.userId]
    );
    res.json({ success: true, message: 'Card marked as collected' });
  } catch (error) {
    console.error('Error marking as collected:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Virtual output folder listing for external print app
// Returns folder-like entries with direct URLs to printable SVG/PNG outputs.
router.get('/printing/output', async (req, res) => {
  try {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const scheme = forwardedProto ? String(forwardedProto).split(',')[0].trim() : req.protocol;
    const baseUrl = `${scheme}://${req.get('host')}`;
    const result = await db.query(`
      SELECT u.id, u.status, u.approved_at, u.printed_at, u.collected_at,
             u.surname, u.other_names, ed.card_number,
             CASE WHEN u.id_card_image IS NOT NULL THEN true ELSE false END AS has_image
      FROM id_card_users u
      LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
      WHERE u.status IN ('approved', 'printed', 'collected')
      ORDER BY u.approved_at DESC NULLS LAST, u.id DESC
    `);

    const files = result.rows
      .map((row) => ({
        id: row.id,
        fileName: `${row.id}.png`,
        cardNumber: row.card_number,
        status: row.status,
        hasImage: row.has_image,
        approvedAt: row.approved_at,
        printedAt: row.printed_at,
        collectedAt: row.collected_at,
        fullName: `${row.surname || ''} ${row.other_names || ''}`.trim(),
        url: `${baseUrl}/api/printing/output-svg?cardId=${row.id}`,
        svgUrl: `${baseUrl}/api/printing/output-svg?cardId=${row.id}`,
        pngUrl: `${baseUrl}/api/printing/output-image?cardId=${row.id}`
      }));

    res.json({ success: true, files, count: files.length });
  } catch (error) {
    console.error('Error listing printing output:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stable single-segment SVG endpoint for external print app (print-production format)
router.get('/printing/output-svg', async (req, res) => {
  try {
    const cardId = req.query.cardId;
    if (!cardId) {
      return res.status(400).json({ success: false, message: 'cardId is required' });
    }

    const result = await db.query(
      `SELECT u.id,
              u.surname, u.other_names, u.matric_no, u.staff_id,
              u.department, u.faculty, u.level, u.marital_status, u.birth_date,
              u.hall, u.passport_photo, u.signature,
              ed.card_number, ed.session
       FROM id_card_users u
       LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
       WHERE (u.id::text = $1 OR u.excel_data_id::text = $1 OR ed.card_number::text = $1)
         AND u.status IN ('approved', 'printed', 'collected')
       ORDER BY u.approved_at DESC NULLS LAST, u.id DESC
       LIMIT 1`,
      [cardId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Printable output for card ${cardId} not found`
      });
    }

    const row = result.rows[0];
    const generateIDCardOverlay = require('../utils/idCardGenerator');
    const generateIDCardSvg = generateIDCardOverlay.generateIDCardSvg;

    if (typeof generateIDCardSvg !== 'function') {
      return res.status(500).json({ success: false, message: 'SVG generator unavailable' });
    }

    const svg = await generateIDCardSvg(row, false);
    res.set('Content-Type', 'image/svg+xml; charset=utf-8');
    res.send(svg);
  } catch (error) {
    console.error('Error fetching printing output SVG:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stable single-segment output image endpoint for external print app
router.get('/printing/output-image', async (req, res) => {
  try {
    const cardId = req.query.cardId;
    if (!cardId) {
      return res.status(400).json({ success: false, message: 'cardId is required' });
    }

    const result = await db.query(
      `SELECT u.id, u.id_card_image,
              u.surname, u.other_names, u.matric_no, u.staff_id,
              u.department, u.faculty, u.level, u.marital_status, u.birth_date,
              u.hall, u.passport_photo, u.signature,
              ed.card_number, ed.session
       FROM id_card_users u
       LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
       WHERE (u.id::text = $1 OR u.excel_data_id::text = $1 OR ed.card_number::text = $1)
         AND u.status IN ('approved', 'printed', 'collected')
       ORDER BY u.approved_at DESC NULLS LAST, u.id DESC
       LIMIT 1`,
      [cardId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Printable output for card ${cardId} not found`
      });
    }

    const row = result.rows[0];
    const imageBuffer = row.id_card_image;

    // Keep this endpoint as a pure fetch API for already-prepared printable PNGs.
    // Generation should happen in the capture/approval workflow, not at print fetch time.
    if (!imageBuffer) {
      return res.status(404).json({
        success: false,
        message: `Printable PNG for card ${cardId} is not ready yet`
      });
    }

    res.set('Content-Type', 'image/png');
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error fetching printing output image:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Virtual output folder file endpoint
router.get('/printing/output/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    const result = await db.query(
      `SELECT u.id_card_image
       FROM id_card_users u
       LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
       WHERE (u.id::text = $1 OR u.excel_data_id::text = $1 OR ed.card_number::text = $1)
         AND u.status IN ('approved', 'printed', 'collected')
       ORDER BY u.approved_at DESC NULLS LAST, u.id DESC
       LIMIT 1`,
      [cardId]
    );

    if (result.rows.length === 0 || !result.rows[0].id_card_image) {
      return res.status(404).json({
        success: false,
        message: `Printable output for card ${cardId} not found`
      });
    }

    res.set('Content-Type', 'image/png');
    res.send(result.rows[0].id_card_image);
  } catch (error) {
    console.error('Error fetching printing output image:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// Get approved card image (for print app) — matches endpoint expected by id-card-unit app
router.get('/card-images/:cardId/image', async (req, res) => {
  try {
    const { cardId } = req.params;
    const result = await db.query(
      `SELECT u.id, u.status, u.id_card_image 
       FROM id_card_users u
       LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
       WHERE (u.id::text = $1 OR u.excel_data_id::text = $1 OR ed.card_number::text = $1)
         AND u.status IN ('approved', 'printed', 'collected')
       ORDER BY u.approved_at DESC NULLS LAST, u.id DESC
       LIMIT 1`,
      [cardId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `Card with ID ${cardId} not found in capture app. It may not be approved/printable yet.` 
      });
    }

    const card = result.rows[0];
    if (!card.id_card_image) {
      return res.status(404).json({ 
        success: false, 
        message: `Card image not found. The capture app may not have generated this card yet.` 
      });
    }

    res.set('Content-Type', 'image/png');
    res.send(card.id_card_image);
  } catch (error) {
    console.error('Error fetching card image:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get captured fingerprint for verification during collection
router.get('/printing/fingerprint', async (req, res) => {
  try {
    const cardId = req.query.cardId;
    if (!cardId) {
      return res.status(400).json({ success: false, message: 'cardId is required' });
    }

    const result = await db.query(
      `SELECT f.left_thumb, f.left_index, f.right_thumb, f.right_index, f.user_id,
              u.id, u.surname, u.other_names, u.matric_no, u.staff_id, u.status
       FROM fingerprints f
       INNER JOIN id_card_users u ON f.user_id = u.id
       LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
       WHERE (u.id::text = $1 OR u.excel_data_id::text = $1 OR ed.card_number::text = $1)
         AND u.status IN ('approved', 'printed', 'collected')
       ORDER BY u.approved_at DESC NULLS LAST, u.id DESC
       LIMIT 1`,
      [cardId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Fingerprint for card ${cardId} not found or card not in printable status`
      });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      cardId: row.id,
      surname: row.surname,
      other_names: row.other_names,
      matric_no: row.matric_no,
      staff_id: row.staff_id,
      status: row.status,
      fingerprints: {
        left_thumb: row.left_thumb,
        left_index: row.left_index,
        right_thumb: row.right_thumb,
        right_index: row.right_index
      }
    });
  } catch (error) {
    console.error('Error fetching fingerprint:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;