const { Ebook, EbookCategory, EbookOrder, User } = require('../models');

function buildPublicUrl(value, host) {
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
    }

    const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${host}/${normalized}`;
}

function formatEbook(ebook, host) {
    const item = ebook.toJSON ? ebook.toJSON() : ebook;
    return {
        ...item,
        cover_image: buildPublicUrl(item.cover_image, host),
        file_url: buildPublicUrl(item.file_url, host),
        author_name: item.User?.full_name || item.author_name || 'Author',
        category_name: item.EbookCategory?.name || item.category_name || null,
    };
}

const EbookController = {
    async uploadEbook(req, res) {
        try {
            console.log('📝 Incoming Ebook request:', req.body);
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

            const createdEbook = await Ebook.create({
                title,
                description,
                price,
                format: format || 'Ebook',
                printing_cost: printing_cost || 0,
                file_url,
                cover_image,
                author_id: req.user.id, // assuming `req.user` is populated by auth middleware
                category_id,
                is_approved: false,
            });

            const fullEbook = await Ebook.findByPk(createdEbook.id, {
                include: [EbookCategory, User],
            });
            const host = `${req.protocol}://${req.get('host')}`;

            console.log('✅ Ebook created:', fullEbook);
            res.status(201).json({
                message: 'Ebook submitted for review.',
                Ebook: formatEbook(fullEbook, host),
            });
        } catch (err) {
            console.error('❌ Error uploading Ebook:', err);
            res.status(500).json({ error: 'Server error while uploading Ebook.' });
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

            if (req.query.category_id) {
                whereClause.category_id = req.query.category_id;
            }

            console.log('Fetching Ebooks with filter:', whereClause);
            const Ebooks = await Ebook.findAll({
                where: whereClause,
                include: [EbookCategory, User],
            });

            console.log('Ebooks fetched:', Ebooks.length);
            const host = `${req.protocol}://${req.get('host')}`;
            res.json(Ebooks.map((ebook) => formatEbook(ebook, host)));
        } catch (err) {
            console.error('Error listing Ebooks:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async approveEbook(req, res) {
        try {
            const { id } = req.params;
            console.log('Approving Ebook with ID:', id);
            const Ebook = await Ebook.findByPk(id);
            if (!Ebook) return res.status(404).json({ error: 'Ebook not found' });

            Ebook.is_approved = true;
            await Ebook.save();

            console.log('Ebook approved:', Ebook);
            res.json({ message: 'Ebook approved.' });
        } catch (err) {
            console.error('Error approving Ebook:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async createEbookCategory(req, res) {
        try {
            console.log('Creating Ebook category:', req.body);
            const { name, description } = req.body;
            const category = await EbookCategory.create({ name, description });

            console.log('Category created:', category);
            res.status(201).json(category);
        } catch (err) {
            console.error('Error creating category:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async updateEbookCategory(req, res) {
        try {
            const category = await EbookCategory.findByPk(req.params.id);
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            const { name, description, is_active } = req.body;
            if (name !== undefined) category.name = name;
            if (description !== undefined) category.description = description;
            if (is_active !== undefined) category.is_active = is_active;

            await category.save();
            return res.json(category);
        } catch (err) {
            console.error('Error updating category:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async deleteEbookCategory(req, res) {
        try {
            const category = await EbookCategory.findByPk(req.params.id);
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            await category.destroy();
            return res.json({ message: 'Category deleted successfully' });
        } catch (err) {
            console.error('Error deleting category:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getEbookCategories(req, res) {
        try {
            console.log('Fetching active Ebook categories');
            const categories = await EbookCategory.findAll({ where: { is_active: true } });
            res.json(categories);
        } catch (err) {
            console.error('Error fetching categories:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async purchaseEbook(req, res) {
        try {
            const ebookId = req.body.Ebook_id || req.body.ebook_id || req.body.ebookId;
            console.log('User', req.user.id, 'attempting to purchase Ebook:', ebookId);

            if (!ebookId) {
                return res.status(400).json({ error: 'ebook_id is required' });
            }

            const Ebook = await Ebook.findByPk(ebookId);
            if (!Ebook || !Ebook.is_approved) return res.status(400).json({ error: 'Ebook not available' });

            const existing = await EbookOrder.findOne({
                where: { user_id: req.user.id, Ebook_id: ebookId }
            });

            if (existing) return res.status(409).json({ error: 'Already purchased' });

            const order = await EbookOrder.create({
                user_id: req.user.id,
                Ebook_id: ebookId,
                price_paid: Ebook.price
            });

            console.log('Ebook purchased:', order);
            res.status(201).json({ message: 'Purchase successful', order });
        } catch (err) {
            console.error('Error purchasing Ebook:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async updateEbook(req, res) {
        try {
            const { id } = req.params;
            console.log('User', req.user.id, 'attempting to update Ebook:', id);
            const Ebook = await Ebook.findByPk(id);
            if (!Ebook || Ebook.author_id !== req.user.id)
                return res.status(403).json({ error: 'Not allowed' });

            await Ebook.update(req.body);
            console.log('Ebook updated:', Ebook);
            res.json({ message: 'Ebook updated', Ebook });
        } catch (err) {
            console.error('Error updating Ebook:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async deleteEbook(req, res) {
        try {
            const { id } = req.params;
            console.log('User', req.user.id, 'attempting to delete Ebook:', id);
            const Ebook = await Ebook.findByPk(id);
            if (!Ebook || Ebook.author_id !== req.user.id)
                return res.status(403).json({ error: 'Not allowed' });

            await Ebook.destroy();
            console.log('Ebook deleted');
            res.json({ message: 'Ebook deleted' });
        } catch (err) {
            console.error('Error deleting Ebook:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // In EbookController
    async getRandomEbooks(req, res) {
        try {
            const count = await Ebook.count({ where: { is_approved: true } });
            const limit = parseInt(req.query.limit) || 4;
            const randomOffset = Math.max(0, Math.floor(Math.random() * Math.max(1, count - limit)));

            const Ebooks = await Ebook.findAll({
                where: { is_approved: true },
                include: [EbookCategory, User],
                offset: randomOffset,
                limit,
            });

            const host = `${req.protocol}://${req.get('host')}`;
            return res.json(Ebooks.map((ebook) => formatEbook(ebook, host)));
        } catch (err) {
            console.error("Error fetching random Ebooks:", err);
            res.status(500).json({ error: err.message });
        }
    }


};

module.exports = EbookController;
