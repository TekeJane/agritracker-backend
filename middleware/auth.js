// middleware/auth.js
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.id);

        if (!user) {
            return res.status(401).json({ message: 'Invalid authentication token' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Authentication failed' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    return res.status(403).json({ message: 'Forbidden: Admins only' });
};

// Allow admins and sellers (for product creation)
const isAdminOrSeller = (req, res, next) => {
    if (!req.user) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    if (req.user.role === 'admin' || req.user.role === 'seller') {
        return next();
    }
    return res.status(403).json({ message: 'Forbidden: Admins or sellers only' });
};

module.exports = { authenticate, isAdmin, isAdminOrSeller };
