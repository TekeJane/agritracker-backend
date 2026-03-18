const { Ebook, EbookCategory, EbookOrder, User } = require('../models');

const ebookController = {
    async uploadEbook(req, res) {
        try {
            console.log('📝 Incoming ebook request:', req.body);
            console.log('📎 Uploaded files:', req.files);

            const { title, description, price, category_id, format, printing_cost } = req.body;

            if (!title || !description || !price || !category_id) {
                return res.status(400).json({ error: 'Missing required fields.' });
            }

            // Handle uploaded files
            const coverImageFile = req.files?.cover_image?.[0];
            const pdfFile = req.files?.file?.[0];

            if (!coverImageFile) {
                return res.status(400).json({ error: 'Cover image is required.' });
            }

            const cover_image = coverImageFile.path; // full path to uploaded file
            const file_url = pdfFile ? pdfFile.path : null;

            const ebook = await Ebook.create({
                title,
                description,
                price,
                format: format || 'ebook',
                printing_cost: printing_cost || 0,
                file_url,
                cover_image,
                author_id: req.user.id, // assuming `req.user` is populated by auth middleware
                category_id,
                is_approved: false,
            });

            console.log('✅ Ebook created:', ebook);
            res.status(201).json({
                message: 'Ebook submitted for review.',
                ebook,
            });
        } catch (err) {
            console.error('❌ Error uploading ebook:', err);
            res.status(500).json({ error: 'Server error while uploading ebook.' });
        }
    }
    ,


    async listApprovedEbooks(req, res) {
        try {
            const approved = req.query.approved;
            const whereClause = {};
            if (approved === 'false') {
                whereClause.is_approved = false;
            } else {
                whereClause.is_approved = true;
            }

            console.log('Fetching ebooks with filter:', whereClause);
            const ebooks = await Ebook.findAll({
                where: whereClause,
                include: [EbookCategory, User],
            });

            console.log('Ebooks fetched:', ebooks.length);
            res.json(ebooks);
        } catch (err) {
            console.error('Error listing ebooks:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async approveEbook(req, res) {
        try {
            const { id } = req.params;
            console.log('Approving ebook with ID:', id);
            const ebook = await Ebook.findByPk(id);
            if (!ebook) return res.status(404).json({ error: 'Ebook not found' });

            ebook.is_approved = true;
            await ebook.save();

            console.log('Ebook approved:', ebook);
            res.json({ message: 'Ebook approved.' });
        } catch (err) {
            console.error('Error approving ebook:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async createEbookCategory(req, res) {
        try {
            console.log('Creating ebook category:', req.body);
            const { name, description } = req.body;
            const category = await EbookCategory.create({ name, description });

            console.log('Category created:', category);
            res.status(201).json(category);
        } catch (err) {
            console.error('Error creating category:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async getEbookCategories(req, res) {
        try {
            console.log('Fetching active ebook categories');
            const categories = await EbookCategory.findAll({ where: { is_active: true } });
            res.json(categories);
        } catch (err) {
            console.error('Error fetching categories:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async purchaseEbook(req, res) {
        try {
            const { ebook_id } = req.body;
            console.log('User', req.user.id, 'attempting to purchase ebook:', ebook_id);

            const ebook = await Ebook.findByPk(ebook_id);
            if (!ebook || !ebook.is_approved) return res.status(400).json({ error: 'Ebook not available' });

            const existing = await EbookOrder.findOne({
                where: { user_id: req.user.id, ebook_id }
            });

            if (existing) return res.status(409).json({ error: 'Already purchased' });

            const order = await EbookOrder.create({
                user_id: req.user.id,
                ebook_id,
                price_paid: ebook.price
            });

            console.log('Ebook purchased:', order);
            res.status(201).json({ message: 'Purchase successful', order });
        } catch (err) {
            console.error('Error purchasing ebook:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async updateEbook(req, res) {
        try {
            const { id } = req.params;
            console.log('User', req.user.id, 'attempting to update ebook:', id);
            const ebook = await Ebook.findByPk(id);
            if (!ebook || ebook.author_id !== req.user.id)
                return res.status(403).json({ error: 'Not allowed' });

            await ebook.update(req.body);
            console.log('Ebook updated:', ebook);
            res.json({ message: 'Ebook updated', ebook });
        } catch (err) {
            console.error('Error updating ebook:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async deleteEbook(req, res) {
        try {
            const { id } = req.params;
            console.log('User', req.user.id, 'attempting to delete ebook:', id);
            const ebook = await Ebook.findByPk(id);
            if (!ebook || ebook.author_id !== req.user.id)
                return res.status(403).json({ error: 'Not allowed' });

            await ebook.destroy();
            console.log('Ebook deleted');
            res.json({ message: 'Ebook deleted' });
        } catch (err) {
            console.error('Error deleting ebook:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // In ebookController
    async getRandomEbooks(req, res) {
        try {
            const count = await Ebook.count({ where: { is_approved: true } });
            const limit = parseInt(req.query.limit) || 4;
            const randomOffset = Math.max(0, Math.floor(Math.random() * Math.max(1, count - limit)));

            const ebooks = await Ebook.findAll({
                where: { is_approved: true },
                include: [EbookCategory, User],
                offset: randomOffset,
                limit,
            });

            return res.json(ebooks);
        } catch (err) {
            console.error("Error fetching random ebooks:", err);
            res.status(500).json({ error: err.message });
        }
    }


};

module.exports = ebookController;
