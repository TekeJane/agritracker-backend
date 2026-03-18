// controllers/marketController.js
const { OrderItem, Product, Order, User } = require('../models');
const { Sequelize } = require('sequelize');

const BASE_URL = 'http://10.0.2.2:3000'; // Emulator-safe base URL for Flutter dev

module.exports = {
    async topProducts(req, res) {
        console.log('\n📦 [TOP PRODUCTS] Request received at /market/top-products');

        try {
            console.log('🔍 Fetching top products based on total quantity ordered...');

            const results = await OrderItem.findAll({
                attributes: [
                    'ProductId',
                    [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalOrders']
                ],
                include: [
                    {
                        model: Product,
                        attributes: ['name', 'price', 'images', 'market_region']
                    }
                ],
                group: ['ProductId', 'Product.id'],
                order: [[Sequelize.literal('totalOrders'), 'DESC']],
                limit: 10
            });

            // Attach base URL to images
            const formattedResults = results.map((item, index) => {
                const product = item.Product;

                if (product && Array.isArray(product.images)) {
                    product.images = product.images.map(img =>
                        img.startsWith('http') ? img : `${BASE_URL}/${img}`
                    );
                }

                console.log(`  #${index + 1}: ${product.name} (${item.dataValues.totalOrders} orders)`);
                return item;
            });

            console.log(`✅ Top ${formattedResults.length} products fetched successfully.`);
            res.json(formattedResults);
        } catch (error) {
            console.error('❌ Error fetching top products:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    async topSellers(req, res) {
        console.log('\n👤 [TOP SELLERS] Request received at /market/top-sellers');

        try {
            console.log('🔍 Fetching top sellers based on number of delivered orders...');

            const results = await Order.findAll({
                attributes: [
                    'UserId',
                    [Sequelize.fn('COUNT', Sequelize.col('Order.id')), 'totalOrders']
                ],
                where: { status: 'delivered' },
                include: [{
                    model: User,
                    attributes: ['full_name', 'email', 'profile_image']
                }],
                group: ['UserId', 'User.id'],
                order: [[Sequelize.literal('totalOrders'), 'DESC']],
                limit: 5
            });

            const formattedResults = results.map((item, index) => {
                const user = item.User;

                if (user?.profile_image && !user.profile_image.startsWith('http')) {
                    user.profile_image = `${BASE_URL}/${user.profile_image}`;
                }

                console.log(`  #${index + 1}: ${user.full_name} - ${item.dataValues.totalOrders} orders`);
                return item;
            });

            console.log(`✅ Top ${formattedResults.length} sellers fetched successfully.`);
            res.json(formattedResults);
        } catch (error) {
            console.error('❌ Error fetching top sellers:', error.message);
            res.status(500).json({ error: error.message });
        }
    }
};
