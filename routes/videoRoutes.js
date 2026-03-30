const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');
const multer = require('multer');
const { ensureUploadDir } = require('../config/uploadPaths');

const upload = multer({ dest: ensureUploadDir() });

router.post(
  '/',
  authenticate,
  upload.fields([
    { name: 'video_url', maxCount: 1 },
    { name: 'thumbnail_image', maxCount: 1 },
    { name: 'creator_image', maxCount: 1 },
  ]),
  videoController.uploadVideo,
);

router.get('/', videoController.getApprovedVideos);
router.get('/random', videoController.getRandomApprovedVideo);
router.get('/random-multiple', videoController.getRandomVideos);
router.get('/share/:id', videoController.getVideoSharePage);
router.get('/:id', videoController.getVideoById);
router.post('/:id/like', authenticate, videoController.likeVideo);
router.post('/:id/dislike', authenticate, videoController.dislikeVideo);
router.post('/:id/share', videoController.shareVideo);
router.post('/:id/download', videoController.registerDownload);
router.get(
  '/admin/review',
  authenticate,
  authorizeAdmin,
  videoController.getVideosForAdminReview,
);

router.delete('/:id', authenticate, videoController.deleteVideo);
router.delete('/videos/:id', authenticate, videoController.deleteVideo);
router.put(
  '/:id/approve',
  authenticate,
  authorizeAdmin,
  videoController.approveVideo,
);
router.put(
  '/videos/:id/approve',
  authenticate,
  authorizeAdmin,
  videoController.approveVideo,
);
router.delete(
  '/:id/reject',
  authenticate,
  authorizeAdmin,
  videoController.rejectVideo,
);
router.delete(
  '/videos/:id/reject',
  authenticate,
  authorizeAdmin,
  videoController.rejectVideo,
);

router.post(
  '/categories',
  authenticate,
  authorizeAdmin,
  videoController.createCategory,
);
router.post(
  '/videos/categories',
  authenticate,
  authorizeAdmin,
  videoController.createCategory,
);
router.get('/categories', videoController.getCategories);
router.get('/videos/categories', videoController.getCategories);
router.put(
  '/categories/:id',
  authenticate,
  authorizeAdmin,
  videoController.updateCategory,
);
router.put(
  '/videos/categories/:id',
  authenticate,
  authorizeAdmin,
  videoController.updateCategory,
);
router.delete(
  '/categories/:id',
  authenticate,
  authorizeAdmin,
  videoController.deleteCategory,
);
router.delete(
  '/videos/categories/:id',
  authenticate,
  authorizeAdmin,
  videoController.deleteCategory,
);

module.exports = router;
