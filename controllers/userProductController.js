// controllers/userProductController.js
const { Product, Category, SubCategory, User } = require('../models');


const getMyProducts = async (req, res) => {
    try {
        const userId = req.user.id;

        const products = await Product.findAll({
            where: { seller_id: userId },
            include: [
                {
                    model: Category,
                    attributes: ['id', 'name']
                },
                {
                    model: SubCategory,
                    attributes: ['id', 'name']
                },
                {
                    model: User,
                    as: 'seller',
                    attributes: ['id', 'full_name', 'email', 'profile_image']
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            message: 'Products fetched successfully',
            data: products
        });
    } catch (error) {
        console.error('Error fetching user products:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};


const deleteMyProduct = async (req, res) => {
    try {
        const userId = req.user.id;
        const productId = req.params.id;

        const product = await Product.findOne({
            where: {
                id: productId,
                seller_id: userId
            }
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found or not authorized'
            });
        }

        await product.destroy();

        return res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

module.exports = {
    getMyProducts,
    deleteMyProduct
};
