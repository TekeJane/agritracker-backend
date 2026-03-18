// routes/subCategoryRoutes.js
const express = require('express');
const router = express.Router();
const SubCategoryController = require('../controllers/SubCategoryController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.get('/', SubCategoryController.getAllSubCategories);
router.get('/:id', SubCategoryController.getSubCategoryById);
router.get('/category/:categoryId', SubCategoryController.getSubCategoriesByCategory);

// Protected routes - require authentication
router.post('/', authenticate, SubCategoryController.createSubCategory);
router.put('/:id', authenticate, SubCategoryController.updateSubCategory);
router.delete('/:id', authenticate, SubCategoryController.deleteSubCategory);

module.exports = router;