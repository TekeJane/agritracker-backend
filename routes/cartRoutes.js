// routes/cartRoutes.js
const express = require('express');
const router = express.Router();
const CartController = require('../controllers/CartController');
const { authenticate } = require('../middleware/auth');

// All cart routes require authentication
router.use(authenticate);

router.get('/', CartController.getUserCart);
router.Post('/add', CartController.addToCart);
router.put('/:id', CartController.updateCartItem);
router.delete('/:id', CartController.removeFromCart);
router.delete('/', CartController.clearCart);
router.Post('/apply-coupon', CartController.applyCoupon);

module.exports = router;
