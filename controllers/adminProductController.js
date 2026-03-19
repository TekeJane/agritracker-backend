const Product = require('../models/Product'); // Ensure this matches your actual model filename

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

// 3. Create product
const createProduct = async (req, res) => {
    try {
        const { name, description, price, categoryId, subCategoryId } = req.body;
        const images = req.files['images'] ? req.files['images'].map(file => file.filename) : [];
        const videos = req.files['videos'] ? req.files['videos'].map(file => file.filename) : [];

        const product = await Product.create({
            name,
            description,
            price,
            categoryId,
            subCategoryId,
            images,
            videos,
            is_featured: false,
        });

        return res.status(201).json({ message: 'Product created', product });
    } catch (err) {
        return res.status(500).json({ message: 'Error creating product', error: err.message });
    }
};

// 4. Mark product as featured
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

// 5. Unmark featured
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

// 6. Delete product
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
    createProduct,
    markAsFeatured,
    unmarkAsFeatured,
    deleteProduct,
};