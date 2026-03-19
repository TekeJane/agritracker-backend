const express = require('express');
const router = express.Router();
const FeedbackController = require('../controllers/feedbackController');

router.post('/submit', FeedbackController.submitFeedback);

module.exports = router;
