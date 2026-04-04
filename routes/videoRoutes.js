const express = require('express');
const multer = require('multer');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');
const upload = require('../middleware/videoUpload');

function handleVideoUpload(req, res, next) {
  upload.fields([
    { name: 'video_url', maxCount: 1 },
    { name: 'thumbnail_image', maxCount: 1 },
    { name: 'creator_image', maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'Video file is too large. Maximum upload size is 250 MB.',
        });
      }

      return res.status(400).json({
        error: `Video upload failed: ${error.message}`,
      });
    }

    return res.status(400).json({
      error: error.message || 'Video upload failed.',
    });
  });
}

router.post(
  '/',
  authenticate,
  handleVideoUpload,
  videoController.uploadVideo,
);

router.get('/categories', videoController.getCategories);
router.get('/admin/review', authenticate, authorizeAdmin, videoController.getVideosForAdminReview);
router.get('/random', videoController.getRandomApprovedVideo);
router.get('/random-multiple', videoController.getRandomVideos);
router.get('/share/:id', videoController.getVideoSharePage);
router.post(
  '/categories',
  authenticate,
  authorizeAdmin,
  videoController.createCategory,
);
router.put(
  '/categories/:id',
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

router.get('/', videoController.getApprovedVideos);
router.get('/:id/download', videoController.downloadVideo);
router.get('/:id/download-file', videoController.serveVideoDownload);
router.get('/:id', videoController.getVideoById);
router.post('/:id/like', authenticate, videoController.likeVideo);
router.post('/:id/dislike', authenticate, videoController.dislikeVideo);
router.post('/:id/share', videoController.shareVideo);
router.post('/:id/download', videoController.registerDownload);

router.delete('/:id', authenticate, videoController.deleteVideo);
router.put(
  '/:id/feature',
  authenticate,
  authorizeAdmin,
  videoController.featureVideo,
);
router.put(
  '/:id/unfeature',
  authenticate,
  authorizeAdmin,
  videoController.unfeatureVideo,
);
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

module.exports = router;
