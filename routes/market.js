// routes/market.js
const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const {
    getCategoryDailyTrend,
    getCropTrend,
    getRegionTrend,
    getMarketSummary,
    getLatestPrices,
    submitMarketPrice,
} = require("../controllers/marketTrendsController");

router.get('/top-products', marketController.topProducts);
router.get('/top-sellers', marketController.topSellers);
router.get('/category-trend', getCategoryDailyTrend);
router.get('/crop-trend/:cropName', getCropTrend);
router.get('/region-trend', getRegionTrend);
router.get('/summary', getMarketSummary);
router.get('/latest-prices', getLatestPrices);
router.post('/submit-price', submitMarketPrice);

module.exports = router;
