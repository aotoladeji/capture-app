const jwt = require('jsonwebtoken');
const fs = require('fs');
const db = require('../config/database');

const captureController = {
  // Create user record from Excel data (call this after login)
  createUser: async (req, res) => {
    try {
      const { excelDataId } = req.body;
      if (!excelDataId) {
        return res.status(400).json({ success: false, message: 'excelDataId is required' });
      }

      // Fetch the Excel row to get all user data
      const excelResult = await db.query(
        `SELECT surname, other_names, matric_no, pf_number, jamb_reg_no, pg_number, department, faculty, level, marital_status, birth_date, hall 
        FROM excel_data WHERE id = $1`,
        [excelDataId]
      );
      if (excelResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Excel data not found' });
      }
      const excelRow = excelResult.rows[0];

      // Check if user already exists for this excelDataId
      const existing = await db.query('SELECT id FROM id_card_users WHERE excel_data_id = $1', [excelDataId]);
      if (existing.rows.length > 0) {
        const userId = existing.rows[0].id;
        const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
        return res.json({ success: true, userId, token, message: 'User already exists' });
      }

      // Determine user_type based on which ID is present
      const isStudent = !!(excelRow.matric_no || excelRow.jamb_reg_no || excelRow.pg_number);
      const userType = isStudent ? 'student' : (excelRow.pf_number ? 'staff' : null);

      // Insert full user record
      const result = await db.query(
        `INSERT INTO id_card_users 
        (excel_data_id, user_type, surname, other_names, matric_no, staff_id, jamb_reg_no, pg_number, birth_date, department, faculty, level, marital_status, hall, status) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
        RETURNING id`,
        [
          excelDataId,
          userType,
          excelRow.surname,
          excelRow.other_names,
          excelRow.matric_no,
          excelRow.pf_number,
          excelRow.jamb_reg_no,
          excelRow.pg_number,
          excelRow.birth_date,
          excelRow.department,
          excelRow.faculty,
          excelRow.level,
          excelRow.marital_status,
          excelRow.hall,
          'created'
        ]
      );
      const userId = result.rows[0].id;
      const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ success: true, message: 'User created', userId, token });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Save passport photo
  savePassportPhoto: async (req, res) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ message: 'Unauthorized' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;
      if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
      const imageBuffer = fs.readFileSync(req.file.path);
      await db.query('UPDATE id_card_users SET passport_photo = $1 WHERE id = $2', [imageBuffer, userId]);
      fs.unlinkSync(req.file.path);
      res.json({ success: true, message: 'Passport photo saved' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Save signature
  saveSignature: async (req, res) => {
    try {
      const { userId, signatureData } = req.body;
      if (!userId || !signatureData) {
        return res.status(400).json({ success: false, message: 'Missing userId or signatureData' });
      }
      const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      await db.query('UPDATE id_card_users SET signature = $1 WHERE id = $2', [buffer, userId]);
      res.json({ success: true, message: 'Signature saved' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Save fingerprint (flexible mapping)
  saveFingerprint: async (req, res) => {
    try {
      const { userId, fingerType, fingerprintData } = req.body;

      if (!userId || !fingerType || !fingerprintData) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          received: { userId, fingerType, fingerprintDataProvided: !!fingerprintData }
        });
      }

      // Ensure user exists in id_card_users (if not, create placeholder – optional)
      const userCheck = await db.query('SELECT id FROM id_card_users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        await db.query('INSERT INTO id_card_users (id, status) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [userId, 'created']);
      }

      // Flexible mapping
      const lower = fingerType.toLowerCase();
      let dbColumn;
      if (lower.includes('left') && lower.includes('thumb')) dbColumn = 'left_thumb';
      else if (lower.includes('left') && lower.includes('index')) dbColumn = 'left_index';
      else if (lower.includes('right') && lower.includes('thumb')) dbColumn = 'right_thumb';
      else if (lower.includes('right') && lower.includes('index')) dbColumn = 'right_index';
      else {
        return res.status(400).json({
          success: false,
          message: 'Could not determine finger type',
          received: fingerType
        });
      }

      const fingerprintText = fingerprintData;

      const existing = await db.query('SELECT id FROM fingerprints WHERE user_id = $1', [userId]);

      if (existing.rows.length === 0) {
        await db.query(`INSERT INTO fingerprints (user_id, ${dbColumn}) VALUES ($1, $2)`, [userId, fingerprintText]);
      } else {
        await db.query(`UPDATE fingerprints SET ${dbColumn} = $1 WHERE user_id = $2`, [fingerprintText, userId]);
      }

      res.json({ success: true, message: 'Fingerprint saved' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Generate ID card
generateIDCardForUser: async (req, res) => {
  try {
    const { userId } = req.body;
    // Set status to pending_approval
    await db.query('UPDATE id_card_users SET status = $1 WHERE id = $2', ['pending_approval', userId]);
    // Create a staff notification
    await db.query('INSERT INTO staff_notifications (user_id) VALUES ($1)', [userId]);
    res.json({ success: true, message: 'ID card ready for approval' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
},

  // Verify fingerprint against stored templates (for external apps)
  // Does exact-string match. For fuzzy/SDK matching, use getFingerprintTemplates
  // and let the calling app run the comparison with its own SDK.
  verifyFingerprint: async (req, res) => {
    try {
      const { fingerprintData, fingerType } = req.body;
      if (!fingerprintData) {
        return res.status(400).json({ success: false, message: 'fingerprintData is required' });
      }

      // Build column filter if fingerType provided
      const allowed = ['left_thumb', 'left_index', 'right_thumb', 'right_index'];
      let columns = allowed;
      if (fingerType) {
        const lower = fingerType.toLowerCase();
        let col;
        if (lower.includes('left') && lower.includes('thumb')) col = 'left_thumb';
        else if (lower.includes('left') && lower.includes('index')) col = 'left_index';
        else if (lower.includes('right') && lower.includes('thumb')) col = 'right_thumb';
        else if (lower.includes('right') && lower.includes('index')) col = 'right_index';
        if (col) columns = [col];
      }

      // Exact match across specified columns
      const conditions = columns.map((col, i) => `f.${col} = $${i + 1}`).join(' OR ');
      const params = columns.map(() => fingerprintData);

      const result = await db.query(
        `SELECT u.id, u.surname, u.other_names, u.matric_no, u.staff_id,
                u.department, u.faculty, u.user_type, u.status
         FROM fingerprints f
         JOIN id_card_users u ON f.user_id = u.id
         WHERE ${conditions}
         LIMIT 1`,
        params
      );

      if (result.rows.length === 0) {
        return res.json({ success: true, match: false, message: 'No matching fingerprint found' });
      }

      const user = result.rows[0];
      res.json({
        success: true,
        match: true,
        user: {
          id: user.id,
          name: `${user.surname} ${user.other_names}`,
          identifier: user.matric_no || user.staff_id,
          department: user.department,
          faculty: user.faculty,
          userType: user.user_type,
          status: user.status,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Return stored fingerprint templates for a user so the calling app
  // can run SDK-level (fuzzy) matching on its side.
  getFingerprintTemplates: async (req, res) => {
    try {
      const { userId } = req.params;
      const result = await db.query(
        `SELECT f.left_thumb, f.left_index, f.right_thumb, f.right_index,
                u.id, u.surname, u.other_names, u.matric_no, u.staff_id,
                u.department, u.faculty, u.user_type
         FROM fingerprints f
         JOIN id_card_users u ON f.user_id = u.id
         WHERE f.user_id = $1`,
        [userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No fingerprints found for this user' });
      }
      const row = result.rows[0];
      res.json({
        success: true,
        user: {
          id: row.id,
          name: `${row.surname} ${row.other_names}`,
          identifier: row.matric_no || row.staff_id,
          department: row.department,
          faculty: row.faculty,
          userType: row.user_type,
        },
        templates: {
          leftThumb: row.left_thumb,
          leftIndex: row.left_index,
          rightThumb: row.right_thumb,
          rightIndex: row.right_index,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};

module.exports = captureController;