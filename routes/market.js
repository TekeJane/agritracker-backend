// routes/market.js
const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const {getCategoryDailyTrend} = require("../controllers/marketTrendsController");

router.get('/top-products', marketController.topProducts);
router.get('/top-sellers', marketController.topSellers);
router.get('/category-trend', getCategoryDailyTrend);

module.exports = router;
