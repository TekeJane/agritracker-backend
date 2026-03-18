const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });



router.post('/', authenticate, upload.fields([  { name: 'video_url', maxCount: 1 },
    { name: 'thumbnail_image', maxCount: 1 },
]), videoController.uploadVideo);


router.get('/', videoController.getApprovedVideos); // ✅ correct



router.delete('/videos/:id', authenticate, videoController.deleteVideo);


// Approve a video
router.put('/videos/:id/approve', authenticate, authorizeAdmin, videoController.approveVideo);
router.delete('/videos/:id/reject', authenticate, authorizeAdmin, videoController.rejectVideo);

// Video Categories
router.post('/videos/categories', authenticate, authorizeAdmin, videoController.createCategory);
router.get('/categories', videoController.getCategories); // ✅ correct

router.get('/random', videoController.getRandomApprovedVideo);

router.get('/random-multiple', videoController.getRandomVideos);



module.exports = router;
