const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

class ExcelProcessor {
    static async processExcelFile(filePath, originalName) {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            if (jsonData.length === 0) {
                throw new Error('Excel file is empty');
            }
            const normalizedData = jsonData.map(row => this.normalizeRow(row));
            const fileId = await this.saveToDatabase(normalizedData, originalName, filePath);
            return {
                success: true,
                fileId,
                recordCount: normalizedData.length,
                sampleData: normalizedData.slice(0, 3)
            };
        } catch (error) {
            throw error;
        }
    }

    static normalizeRow(row) {
        const normalized = {};
        const columnMapping = {
            // Surname variations
            'sur name': 'surname',
            'surname': 'surname',
            'last name': 'surname',
            'last_name': 'surname',
            // Other names variations
            'other names': 'other_names',
            'other_names': 'other_names',
            'first name': 'other_names',
            'first_name': 'other_names',
            'given name': 'other_names',
            'given_name': 'other_names',
            // Matric variations
            'matric no': 'matric_no',
            'matric_no': 'matric_no',
            'matric number': 'matric_no',
            'matric_number': 'matric_no',
            'matric': 'matric_no',
            'student id': 'matric_no',
            'student_id': 'matric_no',
            // JAMB registration number variations
            'jamb reg no': 'jamb_reg_no',
            'jamb reg. no': 'jamb_reg_no',
            'jamb reg number': 'jamb_reg_no',
            'jamb registration no': 'jamb_reg_no',
            'jamb registration number': 'jamb_reg_no',
            'jamb_reg_no': 'jamb_reg_no',
            'jamb_registration_number': 'jamb_reg_no',
            'jamb no': 'jamb_reg_no',
            'jamb number': 'jamb_reg_no',
            'jamb': 'jamb_reg_no',
            // PG (postgraduate) number variations
            'pg number': 'pg_number',
            'pg_number': 'pg_number',
            'pg no': 'pg_number',
            'pg_no': 'pg_number',
            'postgraduate number': 'pg_number',
            'postgraduate no': 'pg_number',
            // Staff ID variations
            'pf number': 'pf_number',
            'pf_number': 'pf_number',
            'staff id': 'pf_number',
            'staff_id': 'pf_number',
            'staff number': 'pf_number',
            'staff_number': 'pf_number',
            'employee id': 'pf_number',
            'employee_id': 'pf_number',
            // Birth date
            'birth date': 'birth_date',
            'birth_date': 'birth_date',
            'dob': 'birth_date',
            'date of birth': 'birth_date',
            'date_of_birth': 'birth_date',
            // Department
            'department': 'department',
            'dept': 'department',
            // Faculty
            'faculty': 'faculty',
            // Level
            'level': 'level',
            'class': 'level',
            'year': 'level',
            'grade': 'level',
            // Marital status
            'marital status': 'marital_status',
            'marital_status': 'marital_status',
            'status': 'marital_status',
            // Hall variations
            'hall': 'hall',
            'hall of residence': 'hall',
            'residence': 'hall',
            'hostel': 'hall',
            'address': 'hall',
            // Session variations
            'session': 'session',
            'session ': 'session',
            'Session': 'session',
            // Card number variations
            'card number': 'card_number',
            'card_number': 'card_number',
            'Card Number': 'card_number',
            'card no': 'card_number',
        };
        Object.keys(row).forEach(key => {
            const lowerKey = key.toLowerCase().trim();
            if (columnMapping[lowerKey]) {
                normalized[columnMapping[lowerKey]] = row[key];
            } else {
                normalized[lowerKey] = row[key];
            }
        });
        return normalized;
    }

    static async saveToDatabase(data, fileName, filePath) {
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            const fileResult = await client.query(
                `INSERT INTO excel_files (file_name, file_path, total_records) 
                 VALUES ($1, $2, $3) RETURNING id`,
                [fileName, filePath, data.length]
            );
            const fileId = fileResult.rows[0].id;

            for (const row of data) {
                await client.query(
                    `INSERT INTO excel_data 
                     (file_id, surname, other_names, matric_no, pf_number, jamb_reg_no, pg_number,
                      birth_date, department, faculty, level, marital_status, hall, session, card_number, raw_data)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                    [
                        fileId,
                        row.surname || null,
                        row.other_names || null,
                        row.matric_no || null,
                        row.pf_number || null,
                        row.jamb_reg_no || null,
                        row.pg_number || null,
                        row.birth_date || null,
                        row.department || null,
                        row.faculty || null,
                        row.level || null,
                        row.marital_status || null,
                        row.hall || null,
                        row.session || null,
                        row.card_number || null,
                        JSON.stringify(row)
                    ]
                );
            }

            // Deactivate other files
            await client.query('UPDATE excel_files SET is_active = false WHERE id != $1', [fileId]);
            await client.query('COMMIT');
            return fileId;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

        static async searchUser(identifier, userType, surname, generatedCode) {
        try {
            const query = `
                SELECT ed.* 
                FROM excel_data ed
                JOIN excel_files ef ON ed.file_id = ef.id
                                WHERE ef.is_active = true
                                    AND (
                                        (
                                            $2 = 'student'
                                            AND LOWER(TRIM(COALESCE(ed.matric_no, ''))) = LOWER(TRIM($1))
                                            AND (
                                                EXISTS (
                                                    SELECT 1
                                                    FROM scheduled_students ss
                                                    WHERE LOWER(TRIM(COALESCE(ss.matric_number::text, ''))) = LOWER(TRIM($1))
                                                        AND (
                                                            LOWER(TRIM(COALESCE(ss.capture_login_code::text, ''))) = LOWER(TRIM($4))
                                                            OR LOWER(TRIM(COALESCE(ss.login_code::text, ''))) = LOWER(TRIM($4))
                                                        )
                                                )
                                                OR EXISTS (
                                                    SELECT 1
                                                    FROM jsonb_each_text(to_jsonb(ed)) AS rowkv
                                                    WHERE LOWER(rowkv.key) ~ '(generated|access|auth|login).*(code|pin|token)|(code|pin|token).*(generated|access|auth|login)'
                                                        AND LOWER(TRIM(rowkv.value)) = LOWER(TRIM($4))
                                                )
                                                OR EXISTS (
                                                    SELECT 1
                                                    FROM jsonb_each_text(
                                                        CASE
                                                            WHEN jsonb_typeof(ed.raw_data) = 'object' THEN ed.raw_data
                                                            ELSE '{}'::jsonb
                                                        END
                                                    ) AS rawkv
                                                    WHERE LOWER(rawkv.key) ~ '(generated|access|auth|login).*(code|pin|token)|(code|pin|token).*(generated|access|auth|login)'
                                                        AND LOWER(TRIM(rawkv.value)) = LOWER(TRIM($4))
                                                )
                                            )
                                        )
                                        OR (
                                            $2 = 'staff'
                                            AND LOWER(ed.surname) = LOWER($3)
                                            AND ed.pf_number = $1
                                        )
                                    )
                LIMIT 1
            `;
                        const result = await db.query(query, [identifier, userType, surname, generatedCode]);
            if (result.rows.length === 0) {
                return null;
            }
            const userData = result.rows[0];
                        const existingUser = await db.query(
                                `SELECT id FROM id_card_users
                                 WHERE (matric_no = $1 OR staff_id = $2)
                                     AND LOWER(surname) = LOWER($3)`,
                                [userData.matric_no, userData.pf_number, userData.surname]
                        );
            if (existingUser.rows.length > 0) {
                throw new Error('User already completed registration');
            }
            return {
                ...userData,
                user_type: userType
            };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = ExcelProcessor;