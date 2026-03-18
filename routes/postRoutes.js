const express = require('express');
const router = express.Router();
const PostController = require('../controllers/PostController');
const multer = require('multer');
const path = require('path');

// multer config
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

router.get('/Posts', PostController.getPosts);
router.Post('/Posts', upload.single('image'), PostController.createPost);
router.put('/Posts/:PostId', upload.single('image'), PostController.updatePost);
router.delete('/Posts/:PostId', PostController.deletePost);

router.Post('/Posts/:PostId/like', PostController.likePost);
router.Post('/Posts/:PostId/dislike', PostController.dislikePost);
router.Post('/Posts/:PostId/share', PostController.sharePost);
router.Post('/comments/:commentId/like', PostController.likeComment);

router.Post('/comments', PostController.createComment);

module.exports = router;
