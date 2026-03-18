const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');
const { getUsers, blockUser, getBlockedUsers } = require('../controllers/adminUserController');

// List active users
router.get('/', authenticate, authorizeAdmin, getUsers);

// Block a user
router.delete('/:id/block', authenticate, authorizeAdmin, blockUser);

// List blocked users
router.get('/blocked', authenticate, authorizeAdmin, getBlockedUsers);

module.exports = router;
