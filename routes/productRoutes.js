const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/ProductController');
const { authenticate, isAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload'); // Assuming this exists
const notifyUser = require('../services/notifyUser');

// Example:

// Public GET routes
router.get('/', ProductController.getAllProducts);
router.get('/featured', ProductController.getFeaturedProducts);
router.get('/:id', ProductController.getProductById);
router.get('/category/:categoryId', ProductController.getProductsByCategory);
router.get('/subcategory/:subCategoryId', ProductController.getProductsBySubCategory);

// Post product with images and videos
router.Post(
  '/',
  upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
  ]),
  ProductController.createProduct,
);

module.exports = router;
