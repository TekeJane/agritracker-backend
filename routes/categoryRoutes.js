// routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const CategoryController = require('../controllers/CategoryController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.get('/', CategoryController.getAllCategories);
router.get('/:id', CategoryController.getCategoryById);

// Protected routes - require authentication
router.post('/', authenticate, CategoryController.createCategory);
router.put('/:id', authenticate, CategoryController.updateCategory);
router.delete('/:id', authenticate, CategoryController.deleteCategory);

router.get('/top', CategoryController.getTopCategories);
module.exports = router;