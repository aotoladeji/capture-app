const multer = require('multer');
const path = require('path');
const fs = require('fs');

const isVercel = Boolean(process.env.VERCEL);

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_PATH || (isVercel ? '/tmp/excel/uploads' : './excel/uploads');
const imageUploadDir = process.env.IMAGE_UPLOAD_PATH || (isVercel ? '/tmp/uploads/images' : './uploads/images');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(imageUploadDir)) {
    fs.mkdirSync(imageUploadDir, { recursive: true });
}

// Configure storage for Excel files
const excelStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Configure storage for images
const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imageUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'img-' + uniqueSuffix + '.jpg');
    }
});

// File filter for Excel files
const excelFileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'application/vnd.oasis.opendocument.spreadsheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only Excel files (.xlsx, .xls, .csv) are allowed'), false);
    }
};

// File filter for images
const imageFileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

// Create multer instances
const uploadExcel = multer({
    storage: excelStorage,
    fileFilter: excelFileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760
    }
});

const uploadImage = multer({
    storage: imageStorage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB for images
    }
});

module.exports = { uploadExcel, uploadImage };