const express = require('express');
const router = express.Router();
const { getMyProfile, updateMyProfile } = require('../controllers/myProfileController');
const { authenticate } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.get('/', authenticate, getMyProfile);

router.put('/', authenticate, upload.single('profile_image'), updateMyProfile);

module.exports = router;
