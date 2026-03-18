const { Review, Product, User } = require('../models');

const ReviewController = {
    // ✅ Get all reviews for a product
    async getReviews(req, res) {
        const productId = req.params.productId;

        try {
            const reviews = await Review.findAll({
                where: { productId },
                include: [
                    {
                        model: User,
                        as: 'user', // ✅ must match alias in Review.belongsTo(...)
                        attributes: ['id', 'full_name', 'profile_image'],
                    }
                ],
                order: [['createdAt', 'DESC']],
            });

            return res.status(200).json(reviews);
        } catch (error) {
            console.error('❌ Failed to fetch reviews:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    // ✅ Add a new review to a product
    async addReview(req, res) {
        const productId = req.params.productId;
        const { rating, comment } = req.body;
        const user_id = req.user?.id || req.body.user_id; // fallback to body if no auth

        try {
            // Check if product exists
            const product = await Product.findByPk(productId);
            if (!product) {
                return res.status(404).json({ error: 'Product not found' });
            }

            // Optionally check if user already reviewed this product
            const existing = await Review.findOne({ where: { productId, user_id } });
            if (existing) {
                return res.status(400).json({ error: 'You already reviewed this product.' });
            }

            // Create the review
            const newReview = await Review.create({
                productId,
                user_id,
                rating,
                comment,
            });

            return res.status(201).json(newReview);
        } catch (error) {
            console.error('❌ Failed to add review:', error);
            return res.status(500).json({ error: error.message });
        }
    },
};

module.exports = ReviewController;
