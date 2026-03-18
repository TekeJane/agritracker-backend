const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/reviewController');


router.get('/reviews/:productId', ReviewController.getReviews); // mirror route

// GET all reviews for a product
router.get('/products/:productId/reviews', ReviewController.getReviews);

// POST a review to a product
router.post('/products/:productId/reviews', ReviewController.addReview);

module.exports = router;
