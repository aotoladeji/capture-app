const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const DEFAULT_ADMIN_PASSWORD = 'oladeji';

const ensureAdminSchema = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            role VARCHAR(50) NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
};

const ensureDefaultAccounts = async () => {
    const adminHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    const staffHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

    await db.query(
        `INSERT INTO admins (role, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (role) DO NOTHING`,
        ['admin', adminHash]
    );

    await db.query(
        `INSERT INTO admins (role, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (role) DO NOTHING`,
        ['staff', staffHash]
    );
};

// ============================================
// Initialize default admin and staff accounts
// Call this once when server starts
// ============================================
const initAdminAccounts = async () => {
    try {
        await ensureAdminSchema();
        await ensureDefaultAccounts();
    } catch (error) {
        console.error('Error creating default admin accounts:', error);
    }
};

// ============================================
// Admin / Staff Login (password only, no username)
// ============================================
const login = async (req, res) => {
    try {
        const { password, role } = req.body;

        // Self-heal on fresh DBs after host/instance switches.
        await ensureAdminSchema();

        if (!password || !role) {
            return res.status(400).json({
                success: false,
                message: 'Password and role are required'
            });
        }

        // Find user by role
        const result = await db.query(
            'SELECT * FROM admins WHERE role = $1',
            [role]
        );

        if (result.rows.length === 0) {
            await ensureDefaultAccounts();
            const seeded = await db.query(
                'SELECT * FROM admins WHERE role = $1',
                [role]
            );

            if (seeded.rows.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            const seededAdmin = seeded.rows[0];
            const seededValid = await bcrypt.compare(password, seededAdmin.password_hash);
            if (!seededValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            if (!process.env.JWT_SECRET) {
                console.error('Login failed: JWT_SECRET is not set in environment');
                return res.status(500).json({
                    success: false,
                    message: 'Server configuration error'
                });
            }

            const token = jwt.sign(
                { id: seededAdmin.id, role: seededAdmin.role },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            return res.json({
                success: true,
                message: 'Login successful',
                token,
                role: seededAdmin.role
            });
        }

        const admin = result.rows[0];

        // Compare password
        const isValid = await bcrypt.compare(password, admin.password_hash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        if (!process.env.JWT_SECRET) {
            console.error('Login failed: JWT_SECRET is not set in environment');
            return res.status(500).json({
                success: false,
                message: 'Server configuration error'
            });
        }

        const token = jwt.sign(
            { id: admin.id, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            role: admin.role
        });

    } catch (error) {
        console.error('Login failed:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
};

// ============================================
// Change Password (requires old password)
// ============================================
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const adminId = req.user.id; // from verifyAdmin middleware

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both old and new passwords are required' });
    }

    // Get current password hash
    const result = await db.query('SELECT password_hash FROM admins WHERE id = $1', [adminId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const currentHash = result.rows[0].password_hash;
    const isValid = await bcrypt.compare(oldPassword, currentHash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Old password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [newHash, adminId]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
module.exports = {
    initAdminAccounts,
    login,
    changePassword
};