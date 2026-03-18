const express = require('express');
const router = express.Router();
const {
    getAllProducts,
    getFeaturedProducts,
    markAsFeatured,
    unmarkAsFeatured,
    deleteProduct,
} = require('../controllers/adminProductController');
const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');

router.get('/', authenticate, authorizeAdmin, getAllProducts);
router.get('/featured', authenticate, authorizeAdmin, getFeaturedProducts);
router.put('/:id/feature', authenticate, authorizeAdmin, markAsFeatured);
router.put('/:id/unfeature', authenticate, authorizeAdmin, unmarkAsFeatured);
router.delete('/:id', authenticate, authorizeAdmin, deleteProduct);

module.exports = router;
