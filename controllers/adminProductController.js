const Product = require('../models/product');

// 1. Get all products
const getAllProducts = async (req, res) => {
    try {
        const products = await Product.findAll();
        return res.status(200).json({ products });
    } catch (err) {
        return res.status(500).json({ message: 'Error fetching products', error: err.message });
    }
};

// 2. Get featured products
const getFeaturedProducts = async (req, res) => {
    try {
        const featured = await Product.findAll({ where: { is_featured: true } });
        return res.status(200).json({ products: featured });
    } catch (err) {
        return res.status(500).json({ message: 'Error fetching featured products', error: err.message });
    }
};

// 3. Mark product as featured
const markAsFeatured = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        product.is_featured = true;
        await product.save();
        return res.status(200).json({ message: 'Product marked as featured' });
    } catch (err) {
        return res.status(500).json({ message: 'Error updating product', error: err.message });
    }
};

// 4. Unmark featured
const unmarkAsFeatured = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        product.is_featured = false;
        await product.save();
        return res.status(200).json({ message: 'Product removed from featured' });
    } catch (err) {
        return res.status(500).json({ message: 'Error updating product', error: err.message });
    }
};

// 5. Delete product
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        await product.destroy();
        return res.status(200).json({ message: 'Product deleted' });
    } catch (err) {
        return res.status(500).json({ message: 'Error deleting product', error: err.message });
    }
};

module.exports = {
    getAllProducts,
    getFeaturedProducts,
    markAsFeatured,
    unmarkAsFeatured,
    deleteProduct,
};
