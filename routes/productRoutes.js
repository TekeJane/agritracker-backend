const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/ProductController');
const { authenticate, isAdmin, isAdminOrSeller } = require('../middleware/auth');
const upload = require('../middleware/upload'); // Multer middleware
const notifyUser = require('../services/notifyUser');

// Public GET routes
router.get('/', ProductController.getAllProducts);
router.get('/featured', ProductController.getFeaturedProducts);
router.get('/:id', ProductController.getProductById);
router.get('/category/:categoryId', ProductController.getProductsByCategory);
router.get('/subcategory/:subCategoryId', ProductController.getProductsBySubCategory);

// POST product (admin only) with images/videos
router.post(
    '/',
    authenticate,
    upload.fields([
        { name: 'images', maxCount: 10 },
        { name: 'videos', maxCount: 5 },
    ]),
    ProductController.createProduct
);

// Optional: mark/unmark featured (admin only)
router.put('/featured/:id', authenticate, isAdmin, ProductController.markAsFeatured);
router.put('/unfeatured/:id', authenticate, isAdmin, ProductController.unmarkAsFeatured);

// Delete product (admin only)
router.delete('/:id', authenticate, isAdmin, ProductController.deleteProduct);

module.exports = router;
