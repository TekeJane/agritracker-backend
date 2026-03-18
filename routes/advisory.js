const express = require('express');
const router = express.Router();
const advisoryController = require('../controllers/advisoryController');

// POST: Get advisory by filters
router.post('/advisory', advisoryController.getAdvisory);

// GET: Fetch all advisory data (for dropdowns)
router.get('/advisory', advisoryController.getAllAdvisories);

module.exports = router;
