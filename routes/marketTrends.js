const express = require('express');
const router = express.Router();
const {
    getMarketSummary,
    getCropTrend,
    submitMarketPrice,
    getCategoryDailyTrend,
} = require('../controllers/marketTrendsController');

// Routes
router.get('/summary', getMarketSummary);
router.get('/category/daily', getCategoryDailyTrend);
router.get('/:cropName', getCropTrend);
router.post('/submit', submitMarketPrice);




module.exports = router;
