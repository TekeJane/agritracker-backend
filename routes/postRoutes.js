const express = require('express');
const router = express.Router();
const PostController = require('../controllers/PostController');
const multer = require('multer');
const path = require('path');

// Multer config
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

// Post routes
router.get('/Posts', PostController.getPosts);
router.post('/Posts', upload.single('image'), PostController.createPost);
router.put('/Posts/:PostId', upload.single('image'), PostController.updatePost);
router.delete('/Posts/:PostId', PostController.deletePost);

// Post interactions
router.post('/Posts/:PostId/like', PostController.likePost);
router.post('/Posts/:PostId/dislike', PostController.dislikePost);
router.post('/Posts/:PostId/share', PostController.sharePost);

// Comment routes
router.post('/comments/:commentId/like', PostController.likeComment);
router.post('/comments', PostController.createComment);

module.exports = router;