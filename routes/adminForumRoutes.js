const express = require('express');
const router = express.Router();

const {
    getAllMessages,
    postMessage,
    deleteMessage
} = require('../controllers/adminForumController');

const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload'); // multer middleware

// Admin-only routes
router.get('/', authenticate, authorizeAdmin, getAllMessages);
router.post('/', authenticate, authorizeAdmin, upload.single('image'), postMessage);
router.delete('/:id', authenticate, authorizeAdmin, deleteMessage);

module.exports = router;
