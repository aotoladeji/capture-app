// server/middleware/auth.js
const jwt = require('jsonwebtoken');

exports.verifyAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!['admin', 'staff'].includes(decoded.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

exports.verifyApiKey = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.VERIFY_API_KEY) {
        return res.status(401).json({ success: false, message: 'Invalid or missing API key' });
    }
    next();
};

const authMiddleware = {
    verifyToken: (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
    },
    
    generateToken: (userData) => {
        return jwt.sign(
            {
                id: userData.id,
                surname: userData.surname,
                user_type: userData.user_type,
                identifier: userData.matric_no || userData.pf_number
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
    }
};

module.exports = {
    ...authMiddleware,
    verifyAdmin: exports.verifyAdmin,
    verifyApiKey: exports.verifyApiKey,
};