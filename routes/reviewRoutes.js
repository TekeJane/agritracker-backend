const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/authMiddleware');


router.get('/reviews/:productId', ReviewController.getReviews); // mirror route

// GET all reviews for a product
router.get('/products/:productId/reviews', ReviewController.getReviews);
router.get('/ebooks/:ebookId/reviews', ReviewController.getEbookReviews);

// Post a review to a product
router.post('/products/:productId/reviews', authenticate, ReviewController.addReview);
router.post('/ebooks/:ebookId/reviews', authenticate, ReviewController.addEbookReview);

module.exports = router;
