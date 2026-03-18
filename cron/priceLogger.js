const Product = require('../models/Product');
const ProductPriceLog = require('../models/ProductPriceLog');

const logPrices = async () => {
    try {
        const products = await Product.findAll({
            attributes: ['id', 'price']
        });

        const logs = products.map(p => ({
            product_id: p.id,
            price: p.price,
        }));

        await ProductPriceLog.bulkCreate(logs);
        console.log(`✅ Logged ${logs.length} product prices @ ${new Date().toISOString()}`);
    } catch (error) {
        console.error('❌ Failed to log product prices:', error.message);
    }
};

// Run every hour
setInterval(logPrices, 1000 * 60 * 60); // 1 hour
