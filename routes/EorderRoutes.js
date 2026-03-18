const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const orderController = require('../controllers/orderController');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

// Validation middleware
const validateOrder = [
    body('ebook_id')
        .isInt({ min: 1 })
        .withMessage('Valid ebook ID is required'),
    body('payment_method')
        .isIn(['mobile_money', 'bank_transfer', 'card'])
        .withMessage('Valid payment method is required'),
    body('customer_email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    body('customer_phone')
        .isMobilePhone()
        .withMessage('Valid phone number is required'),
    body('customer_address')
        .trim()
        .isLength({ min: 10, max: 1000 })
        .withMessage('Address must be between 10 and 1000 characters'),
    body('note')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Note cannot exceed 1000 characters')
];

const validateOrderUpdate = [
    body('payment_status')
        .isIn(['pending', 'completed', 'failed', 'refunded'])
        .withMessage('Valid payment status is required'),
    body('transaction_id')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Transaction ID cannot exceed 100 characters'),
    body('refund_reason')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Refund reason cannot exceed 1000 characters')
];

// Create new order (purchase ebook)
router.post('/', optionalAuth, validateOrder, orderController.createOrder);

// Get order by order ID
router.get('/:orderId', optionalAuth, orderController.getOrderById);

// Download ebook (for purchased items)
router.get('/:orderId/download', optionalAuth, orderController.downloadEbook);

// Protected routes (require authentication)
// Get user's orders
router.get('/user/orders', authenticateToken, orderController.getUserOrders);

// Admin routes
// Get all orders (admin only)
router.get('/', authenticateToken, requireAdmin, orderController.getAllOrders);

// Update order status (admin only)
router.put(
    '/:orderId/status',
    authenticateToken,
    requireAdmin,
    validateOrderUpdate,
    orderController.updateOrderStatus
);

module.exports = router;