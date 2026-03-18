const express = require('express');
const router = express.Router();
const FeedbackController = require('../controllers/FeedbackController');

router.Post('/submit', FeedbackController.submitFeedback);

module.exports = router;
