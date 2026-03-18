const Product = require('../models/Product');
const ProductPriceLog = require('../models/ProductPriceLog');
const { Op } = require('sequelize');
// GET /api/market-trends/summary

const getMarketSummary = async (req, res) => {
    const { region, from, to } = req.query;

    const where = {};
    if (region && region !== 'All') where.market_region = region;
    if (from && to) {
        where.createdAt = { [Op.between]: [new Date(from), new Date(to)] };
    }

    try {
        const products = await Product.findAll({
            where,
            attributes: ['name', 'price'],
        });

        const grouped = {};
        products.forEach(({ name, price }) => {
            if (!grouped[name]) grouped[name] = [];
            grouped[name].push(parseFloat(price));
        });

        const summary = Object.entries(grouped).map(([crop, prices]) => {
            const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
            return { crop, avg_price: avg.toFixed(2) };
        });

        res.json(summary);
    } catch (err) {
        console.error("❌ Market summary error:", err);
        res.status(500).json({ message: 'Server error' });
    }
};


// GET /api/market-trends/:cropName
const getCropTrend = async (req, res) => {
    try {
        const cropName = req.params.cropName;

        const logs = await ProductPriceLog.findAll({
            include: [{
                model: Product,
                attributes: ['name'],
                where: { name: cropName }
            }],
            order: [['logged_at', 'ASC']],
        });

        const trend = logs.map(log => ({
            date: log.logged_at,
            price: log.price,
        }));

        res.status(200).json({ crop: cropName, trend });
    } catch (err) {
        console.error("❌ Error in getCropTrend:", err);
        res.status(500).json({ message: 'Server error' });
    }
};



const getCategoryDailyTrend = async (req, res) => {
    const { category_id, from, to } = req.query;

    console.log("🔎 getCategoryDailyTrend called with params:", {
        category_id,
        from,
        to,
    });

    if (!category_id || !from || !to) {
        console.warn("⚠️ Missing required query parameters.");
        return res.status(400).json({ message: "category_id, from, and to are required." });
    }

    try {
        console.log("🛠️ Fetching ProductPriceLog entries from DB...");

        const logs = await ProductPriceLog.findAll({
            include: [
                {
                    model: Product,
                    attributes: ['name', 'CategoryId'],
                    where: {
                        CategoryId: category_id
                    }
                }
            ],
            where: {
                logged_at: {
                    [Op.between]: [new Date(from), new Date(to)]
                }
            },
            order: [['logged_at', 'ASC']],
        });

        console.log(`✅ Retrieved ${logs.length} log(s).`);

        logs.forEach((log, idx) => {
            console.log(`   [${idx + 1}]`, {
                logged_at: log.logged_at,
                price: log.price,
                productName: log.Product?.name,
                categoryId: log.Product?.CategoryId,
            });
        });

        // Group by date
        const dateMap = {};

        logs.forEach(log => {
            const dateStr = log.logged_at.toISOString().split('T')[0];
            if (!dateMap[dateStr]) {
                dateMap[dateStr] = [];
            }
            dateMap[dateStr].push(parseFloat(log.price));
        });

        console.log("📊 Grouped prices by date:", JSON.stringify(dateMap, null, 2));

        const dates = Object.keys(dateMap).sort();
        const avg_prices = dates.map(date => {
            const prices = dateMap[date];
            const sum = prices.reduce((a, b) => a + b, 0);
            const avg = parseFloat((sum / prices.length).toFixed(2));
            console.log(`➡️ Date: ${date}, Average Price: ${avg}`);
            return avg;
        });

        console.log("✅ Final response data:", {
            category_id,
            dates,
            avg_prices
        });

        return res.json({
            category_id,
            dates,
            avg_prices
        });

    } catch (err) {
        console.error("❌ Error in getCategoryDailyTrend:", err);
        res.status(500).json({ message: "Server error" });
    }
};






// controllers/marketTrendsController.js
const submitMarketPrice = async (req, res) => {
    const { crop_name, price, market_region } = req.body;
    const userId = req.user?.id;

    if (!crop_name || !price || !market_region) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        const product = await Product.create({
            name: crop_name,
            price,
            market_region,
            description: 'User-submitted price',
            stock_quantity: 1,
            seller_id: userId,
            CategoryId: 1, // placeholder or inferred from name
            SubCategoryId: 1,
        });

        res.status(201).json({ message: 'Price submitted', product });
    } catch (e) {
        console.error('❌ Submission failed:', e);
        res.status(500).json({ message: 'Server error' });
    }
};


module.exports = {
    getMarketSummary,
    getCropTrend,
    getCategoryDailyTrend,
    submitMarketPrice,
};
