const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./config/database');
const authController = require('./controllers/authController');

require('dotenv').config();

const app = express();
const apiRoutes = require('./routes/api');

const isVercel = Boolean(process.env.VERCEL);
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4000',
    'http://localhost:5173',
    'https://id-card-unit.vercel.app',
    process.env.CLIENT_URL
].filter(Boolean);

// Middleware
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure core DB schema exists on cold start/new database instances.
app.use(async (req, res, next) => {
    try {
        await db.ensureSchemaInitialized();
        next();
    } catch (error) {
        console.error('Database schema initialization failed:', error);
        res.status(503).json({
            success: false,
            message: 'Database initialization failed'
        });
    }
});

// Initialize default admin/staff accounts
if (!isVercel || process.env.INIT_ADMIN_ACCOUNTS === 'true') {
    authController.initAdminAccounts();
}

// Create necessary directories
const runtimeDirectories = [
    process.env.UPLOAD_PATH || (isVercel ? '/tmp/excel/uploads' : './excel/uploads'),
    process.env.IMAGE_UPLOAD_PATH || (isVercel ? '/tmp/uploads/images' : './uploads/images'),
    process.env.LOG_PATH || './logs'
];

runtimeDirectories.forEach((dir) => {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (err) {
        // On some serverless filesystems writes can fail outside /tmp.
        console.warn(`Could not create runtime directory: ${dir}`, err.message);
    }
});

// Serve static files (local / non-serverless usage)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/excel', express.static(path.join(__dirname, 'excel/uploads')));

// API Routes
app.use('/api', apiRoutes);
app.use('/', apiRoutes);

// Serve React app in production (local monolith deployment)
if (process.env.NODE_ENV === 'production' && !isVercel) {
    app.use(express.static(path.join(__dirname, '../client/dist')));
}

const sendHealth = async (res) => {
    try {
        const result = await db.query('SELECT current_database() AS database_name');
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'ID Card Platform API',
            database: {
                connected: true,
                name: result.rows[0]?.database_name || null
            }
        });
    } catch (error) {
        res.status(503).json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            service: 'ID Card Platform API',
            database: {
                connected: false,
                error: error.message
            }
        });
    }
};

app.get('/health', async (req, res) => {
    await sendHealth(res);
});

app.get('/api/health', async (req, res) => {
    await sendHealth(res);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size is 10MB.'
        });
    }

    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: `File upload error: ${err.message}`
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    if (process.env.NODE_ENV === 'production' && !isVercel && !req.originalUrl.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    } else {
        res.status(404).json({
            success: false,
            message: 'Endpoint not found'
        });
    }
});

module.exports = app;
