// controllers/CategoryController.js
const { Category, SubCategory } = require('../models');

const CategoryController = {
    // Get all categories with subcategories
    async getAllCategories(req, res) {
        try {
            const categories = await Category.findAll({
                where: { is_active: true },
                include: [{
                    model: SubCategory,
                    where: { is_active: true },
                    required: false
                }]
            });
            return res.status(200).json(categories);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Get category by ID with subcategories
    async getCategoryById(req, res) {
        try {
            const category = await Category.findByPk(req.params.id, {
                include: [{
                    model: SubCategory,
                    where: { is_active: true },
                    required: false
                }]
            });
            if (!category) {
                return res.status(404).json({ message: 'Category not found' });
            }
            return res.status(200).json(category);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Create a new category
    async createCategory(req, res) {
        try {
            const category = await Category.create(req.body);
            return res.status(201).json(category);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Update a category
    async updateCategory(req, res) {
        try {
            const [updated] = await Category.update(req.body, {
                where: { id: req.params.id }
            });
            if (updated) {
                const updatedCategory = await Category.findByPk(req.params.id);
                return res.status(200).json(updatedCategory);
            }
            return res.status(404).json({ message: 'Category not found' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Delete a category
    async deleteCategory(req, res) {
        try {
            const deleted = await Category.destroy({
                where: { id: req.params.id }
            });
            if (deleted) {
                return res.status(204).send();
            }
            return res.status(404).json({ message: 'Category not found' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // ✅ Get top categories based on product count
    async getTopCategories(req, res) {
        try {
            console.log('📊 Fetching top categories by product count');

            const categories = await Category.findAll({
                attributes: [
                    'id', 'name', 'image',
                    [Sequelize.fn('COUNT', Sequelize.col('Products.id')), 'productCount']
                ],
                include: [{
                    model: Product,
                    attributes: [],
                    where: { is_active: true }
                }],
                group: ['Category.id'],
                order: [[Sequelize.literal('productCount'), 'DESC']],
                limit: 5
            });

            return res.status(200).json(categories);
        } catch (err) {
            console.error('❌ Error fetching top categories:', err);
            return res.status(500).json({ error: err.message });
        }
    }

};

module.exports = CategoryController;