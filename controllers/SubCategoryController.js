// controllers/SubCategoryController.js
const { SubCategory, Category } = require('../models');

const SubCategoryController = {
    // Get all subcategories
    async getAllSubCategories(req, res) {
        try {
            const subCategories = await SubCategory.findAll({
                where: { is_active: true },
                include: [Category]
            });
            return res.status(200).json(subCategories);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Get subcategory by ID
    async getSubCategoryById(req, res) {
        try {
            const subCategory = await SubCategory.findByPk(req.params.id, {
                include: [Category]
            });
            if (!subCategory) {
                return res.status(404).json({ message: 'SubCategory not found' });
            }
            return res.status(200).json(subCategory);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Get subcategories by category
    async getSubCategoriesByCategory(req, res) {
        try {
            const subCategories = await SubCategory.findAll({
                where: {
                    category_id: req.params.categoryId,
                    is_active: true
                }
            });
            return res.status(200).json(subCategories);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Create a new subcategory
    async createSubCategory(req, res) {
        try {
            const subCategory = await SubCategory.create(req.body);
            return res.status(201).json(subCategory);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Update a subcategory
    async updateSubCategory(req, res) {
        try {
            const [updated] = await SubCategory.update(req.body, {
                where: { id: req.params.id }
            });
            if (updated) {
                const updatedSubCategory = await SubCategory.findByPk(req.params.id);
                return res.status(200).json(updatedSubCategory);
            }
            return res.status(404).json({ message: 'SubCategory not found' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Delete a subcategory
    async deleteSubCategory(req, res) {
        try {
            const deleted = await SubCategory.destroy({
                where: { id: req.params.id }
            });
            if (deleted) {
                return res.status(204).send();
            }
            return res.status(404).json({ message: 'SubCategory not found' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
};


module.exports = SubCategoryController;