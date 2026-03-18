const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');

const { getMyProducts, deleteMyProduct } = require('../controllers/userProductController');

router.get('/my-products', authenticate, getMyProducts);
router.delete('/my-products/:id', authenticate, deleteMyProduct);

module.exports = router;
