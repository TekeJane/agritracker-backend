const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/OrderController');
const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');
const notifyUser = require('../services/notifyUser');

// Example:

// All order routes require authentication
router.use(authenticate);

// Important: Specific routes first
router.get('/my-products/orders', OrderController.getOrdersForMyProducts);

// User routes
router.get('/', OrderController.getUserOrders);
router.get('/:id', OrderController.getOrderById);
router.post('/', OrderController.createOrder);
router.put('/:id/cancel', OrderController.cancelOrder);

// Admin routes
router.get('/admin/orders', authorizeAdmin, OrderController.getAllOrders);
router.put('/admin/orders/:id/status', authorizeAdmin, OrderController.updateOrderStatus);

module.exports = router;
