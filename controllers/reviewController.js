const { Review, Product, Ebook, User } = require('../models');

const includeUser = [
    {
        model: User,
        as: 'user',
        attributes: ['id', 'full_name', 'profile_image'],
    },
];

const ReviewController = {
    async getReviews(req, res) {
        const productId = req.params.productId;

        try {
            const reviews = await Review.findAll({
                where: { productId },
                include: includeUser,
                order: [['createdAt', 'DESC']],
            });

            return res.status(200).json(reviews);
        } catch (error) {
            console.error('Failed to fetch product reviews:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getEbookReviews(req, res) {
        const ebookId = req.params.ebookId;

        try {
            const reviews = await Review.findAll({
                where: { ebookId },
                include: includeUser,
                order: [['createdAt', 'DESC']],
            });

            return res.status(200).json(reviews);
        } catch (error) {
            console.error('Failed to fetch ebook reviews:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async addReview(req, res) {
        const productId = req.params.productId;
        const { rating, comment } = req.body;
        const user_id = req.user?.id || req.body.user_id;

        try {
            const product = await Product.findByPk(productId);
            if (!product) {
                return res.status(404).json({ error: 'Product not found' });
            }

            const existing = await Review.findOne({ where: { productId, user_id } });
            if (existing) {
                return res.status(400).json({ error: 'You already reviewed this product.' });
            }

            const newReview = await Review.create({
                productId,
                user_id,
                rating,
                comment,
            });

            return res.status(201).json(newReview);
        } catch (error) {
            console.error('Failed to add product review:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async addEbookReview(req, res) {
        const ebookId = req.params.ebookId;
        const { rating, comment } = req.body;
        const user_id = req.user?.id || req.body.user_id;

        try {
            const ebook = await Ebook.findByPk(ebookId);
            if (!ebook) {
                return res.status(404).json({ error: 'Ebook not found' });
            }

            if (ebook.author_id && Number(ebook.author_id) === Number(user_id)) {
                return res.status(400).json({ error: 'Authors cannot review their own ebooks.' });
            }

            const existing = await Review.findOne({ where: { ebookId, user_id } });
            if (existing) {
                return res.status(400).json({ error: 'You already reviewed this ebook.' });
            }

            const newReview = await Review.create({
                ebookId,
                user_id,
                rating,
                comment,
            });

            return res.status(201).json(newReview);
        } catch (error) {
            console.error('Failed to add ebook review:', error);
            return res.status(500).json({ error: error.message });
        }
    },
};

module.exports = ReviewController;
