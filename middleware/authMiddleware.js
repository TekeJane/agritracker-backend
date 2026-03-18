require('dotenv').config();
const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization header missing or invalid' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'yourSecretKey');

        if (!decoded.id || !decoded.role) {
            return res.status(401).json({ message: 'Invalid token payload' });
        }

        req.user = {
            id: decoded.id,
            role: decoded.role,
            email: decoded.email,
        };

        console.log(`✅ Authenticated ${decoded.role} ID:`, decoded.id);
        next();
    } catch (err) {
        console.error('❌ JWT verification failed:', err.message);
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

const authorizeAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    return res.status(403).json({ message: 'Access denied: Admins only' });
};

module.exports = { authenticate, authorizeAdmin };
