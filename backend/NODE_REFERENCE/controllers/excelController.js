const ExcelProcessor = require('../utils/excelProcessor');
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

const excelController = {
    // ============================================
    // 1. Upload Excel file
    // ============================================
    uploadExcel: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const result = await ExcelProcessor.processExcelFile(
                req.file.path,
                req.file.originalname
            );

            res.json({
                success: true,
                message: `Excel file processed successfully. ${result.recordCount} records imported.`,
                data: result
            });

        } catch (error) {
            console.error('Upload Excel error:', error);

            // Delete uploaded file if processing failed
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Error processing Excel file'
            });
        }
    },

    // ============================================
    // 2. Authenticate user (student/staff login)
    // ============================================
    authenticate: async (req, res) => {
        try {
            const { surname, identifier, userType, generatedCode } = req.body;

            if (!identifier || !userType) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required'
                });
            }

            if (userType === 'student' && !generatedCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Generated code is required for student login'
                });
            }

            if (userType === 'staff' && !surname) {
                return res.status(400).json({
                    success: false,
                    message: 'Surname is required for staff login'
                });
            }

            const userData = await ExcelProcessor.searchUser(
                identifier.trim(),
                userType,
                (surname || '').trim(),
                (generatedCode || '').trim()
            );

            if (!userData) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found in database. Please check your details.'
                });
            }

            res.json({
                success: true,
                message: 'Authentication successful',
                user: userData
            });

        } catch (error) {
            console.error('Authenticate error:', error);

            res.status(error.message.includes('already completed') ? 409 : 500).json({
                success: false,
                message: error.message || 'Authentication failed'
            });
        }
    },

    // ============================================
    // 3. Get all uploaded Excel files
    // ============================================
    getExcelFiles: async (req, res) => {
        try {
            const result = await db.query(
                `SELECT * FROM excel_files 
                 ORDER BY uploaded_at DESC`
            );

            res.json({
                success: true,
                files: result.rows
            });

        } catch (error) {
            console.error('Get Excel files error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching Excel files'
            });
        }
    },

    // ============================================
    // 4. Activate a specific Excel file
    // ============================================
    activateFile: async (req, res) => {
        const client = await db.pool.connect();
        try {
            const { fileId } = req.params;

            await client.query('BEGIN');

            const exists = await client.query(
                'SELECT id FROM excel_files WHERE id = $1',
                [fileId]
            );
            if (exists.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
            }

            // Deactivate all files
            await client.query('UPDATE excel_files SET is_active = false');

            // Activate selected file
            await client.query(
                'UPDATE excel_files SET is_active = true WHERE id = $1',
                [fileId]
            );

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Excel file activated successfully'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Activate Excel file error:', error);
            res.status(500).json({
                success: false,
                message: 'Error activating file'
            });
        } finally {
            client.release();
        }
    },

    // ============================================
    // 5. DELETE an Excel file (added now!)
    // ============================================
    deleteFile: async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { fileId } = req.params;

        await client.query('BEGIN');

        // Get file info
        const fileResult = await client.query(
            'SELECT file_path, is_active FROM excel_files WHERE id = $1',
            [fileId]
        );

        if (fileResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const file = fileResult.rows[0];

        // Get all excel_data ids for this file
        const excelDataIds = await client.query('SELECT id FROM excel_data WHERE file_id = $1', [fileId]);
        if (excelDataIds.rows.length > 0) {
            const ids = excelDataIds.rows.map(row => row.id);
            // Delete any id_card_users that reference these excel_data ids
            await client.query('DELETE FROM id_card_users WHERE excel_data_id = ANY($1::int[])', [ids]);
        }

        // Now delete excel_data
        await client.query('DELETE FROM excel_data WHERE file_id = $1', [fileId]);
        // Delete excel_files record
        await client.query('DELETE FROM excel_files WHERE id = $1', [fileId]);

        await client.query('COMMIT');

        // Delete physical file
        if (file.file_path && fs.existsSync(file.file_path)) {
            fs.unlinkSync(file.file_path);
        }

        res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Delete Excel file error:', error);
        res.status(500).json({ success: false, message: 'Error deleting file' });
    } finally {
        client.release();
    }
},

    // ============================================
    // 6. Download Excel template
    // ============================================
    downloadTemplate: async (req, res) => {
        try {
            const templatePath = path.join(__dirname, '../templates/id_card_template.xlsx');

            // If template doesn't exist, create it
            if (!fs.existsSync(templatePath)) {
                await createTemplate(); // defined below
            }

            res.download(templatePath, 'ID_Card_Data_Template.xlsx');

        } catch (error) {
            console.error('Download template error:', error);
            res.status(500).json({
                success: false,
                message: 'Error downloading template'
            });
        }
    }
};

// ============================================
// Helper function to generate the Excel template
// (This stays OUTSIDE the object – it's just a utility)
// ============================================
async function createTemplate() {
    // You can implement this later – for now, we just create an empty file
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
        ['Sur Name', 'Other Names', 'Matric No', 'PF Number', 'Birth Date', 'Department', 'Faculty', 'Level', 'Marital Status'],
        ['Example', 'Student', '12345', '', '2000-01-01', 'Computer Science', 'Science', '300', 'Single'],
        ['Example', 'Staff', '', 'PF1001', '1985-05-15', 'Mathematics', 'Science', 'Staff', 'Married']
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, path.join(__dirname, '../templates/id_card_template.xlsx'));
}

module.exports = excelController;