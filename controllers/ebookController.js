const { Ebook, EbookCategory, EbookSubCategory, EbookOrder, User, Review } = require('../models');

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
    const galleryImages = Array.isArray(item.gallery_images) ? item.gallery_images : [];
    return {
        ...item,
        cover_image: buildPublicUrl(item.cover_image, host),
        file_url: buildPublicUrl(item.file_url, host),
        gallery_images: galleryImages.map((image) => buildPublicUrl(image, host)),
        keywords: Array.isArray(item.keywords)
            ? item.keywords
            : String(item.keywords || '')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
        author_name: item.User?.full_name || item.author_name || 'Author',
        author_id: item.User?.id || item.author_id || null,
        author_profile_image: buildPublicUrl(item.User?.profile_image || item.author_profile_image, host),
        category_name: item.EbookCategory?.name || item.category_name || null,
        sub_category_id: item.sub_category_id || item.EbookSubCategory?.id || null,
        sub_category_name: item.EbookSubCategory?.name || item.sub_category_name || null,
        ratings_count: item.ratings_count || 0,
        ratings_average: item.ratings_average || 0,
        isPurchased: item.isPurchased || false,
        posted_at: item.posted_at || item.createdAt,
    };
}

async function enrichEbookMetrics(ebookOrEbooks, userId = null) {
    const ebooks = Array.isArray(ebookOrEbooks) ? ebookOrEbooks : [ebookOrEbooks];
    const ebookIds = ebooks.map((ebook) => ebook.id);
    if (ebookIds.length === 0) return Array.isArray(ebookOrEbooks) ? [] : ebookOrEbooks;

    const reviews = await Review.findAll({
        where: { ebookId: ebookIds },
        attributes: ['ebookId', 'rating'],
    });

    const purchases = userId
        ? await EbookOrder.findAll({
            where: {
                user_id: userId,
                Ebook_id: ebookIds,
                payment_status: 'completed',
            },
            attributes: ['Ebook_id'],
        })
        : [];

    const ratingsByEbook = new Map();
    for (const review of reviews) {
        const key = Number(review.ebookId);
        const current = ratingsByEbook.get(key) || { count: 0, total: 0 };
        current.count += 1;
        current.total += Number(review.rating || 0);
        ratingsByEbook.set(key, current);
    }

    const purchasedIds = new Set(
        purchases.map((item) => Number(item.Ebook_id))
    );

    for (const ebook of ebooks) {
        const metrics = ratingsByEbook.get(Number(ebook.id)) || { count: 0, total: 0 };
        ebook.setDataValue('ratings_count', metrics.count);
        ebook.setDataValue(
            'ratings_average',
            metrics.count > 0 ? Number((metrics.total / metrics.count).toFixed(1)) : 0
        );
        ebook.setDataValue('isPurchased', purchasedIds.has(Number(ebook.id)));
    }

    return Array.isArray(ebookOrEbooks) ? ebooks : ebooks[0];
}

const EbookController = {
    async uploadEbook(req, res) {
        try {
            console.log('📝 Incoming Ebook request:', req.body);
            console.log('📎 Uploaded files:', req.files);

            const {
                title,
                description,
                price,
                category_id,
                sub_category_id,
                format,
                printing_cost,
                keywords,
                origin_region,
                origin_town,
                posted_at,
                is_preorder,
                preorder_days,
            } = req.body;

            if (!title || !description || !price || !category_id) {
                return res.status(400).json({ error: 'Missing required fields.' });
            }

            // Handle uploaded files
            const coverImageFile = req.files?.cover_image?.[0];
            const pdfFile = req.files?.file?.[0];
            const galleryImageFiles = req.files?.gallery_images || [];

            if (!coverImageFile) {
                return res.status(400).json({ error: 'Cover image is required.' });
            }

            const cover_image = coverImageFile.path; // full path to uploaded file
            const file_url = pdfFile ? pdfFile.path : null;
            const gallery_images = galleryImageFiles.map((file) => file.path);

            const createdEbook = await Ebook.create({
                title,
                description,
                price,
                format: format || 'Ebook',
                printing_cost: printing_cost || 0,
                keywords: String(keywords || ''),
                file_url,
                cover_image,
                gallery_images,
                author_id: req.user.id, // assuming `req.user` is populated by auth middleware
                category_id,
                sub_category_id: sub_category_id || null,
                origin_region: origin_region || null,
                origin_town: origin_town || null,
                posted_at: posted_at || new Date(),
                is_preorder: String(is_preorder).toLowerCase() === 'true',
                preorder_days: preorder_days ? parseInt(preorder_days, 10) : null,
                is_approved: true,
                is_featured: false,
            });

            const fullEbook = await Ebook.findByPk(createdEbook.id, {
                include: [EbookCategory, EbookSubCategory, User],
            });
            await enrichEbookMetrics(fullEbook, req.user?.id);
            const host = `${req.protocol}://${req.get('host')}`;

            console.log('✅ Ebook created:', fullEbook);
            res.status(201).json({
                message: 'Ebook uploaded successfully.',
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

            if (req.query.featured === 'true') {
                whereClause.is_featured = true;
            } else if (req.query.featured === 'false') {
                whereClause.is_featured = false;
            }

            if (req.query.category_id) {
                whereClause.category_id = req.query.category_id;
            }
            if (req.query.sub_category_id) {
                whereClause.sub_category_id = req.query.sub_category_id;
            }
            if (req.query.author_id) {
                whereClause.author_id = req.query.author_id;
            }

            console.log('Fetching Ebooks with filter:', whereClause);
            const Ebooks = await Ebook.findAll({
                where: whereClause,
                include: [EbookCategory, EbookSubCategory, User],
                order: [['createdAt', 'DESC']],
            });

            console.log('Ebooks fetched:', Ebooks.length);
            await enrichEbookMetrics(Ebooks, req.user?.id);
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

    async getEbookById(req, res) {
        try {
            const ebook = await Ebook.findByPk(req.params.id, {
                include: [EbookCategory, EbookSubCategory, User],
            });

            if (!ebook) {
                return res.status(404).json({ error: 'Ebook not found' });
            }

            await enrichEbookMetrics(ebook, req.user?.id);
            const host = `${req.protocol}://${req.get('host')}`;
            return res.json(formatEbook(ebook, host));
        } catch (err) {
            console.error('Error fetching ebook by id:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async featureEbook(req, res) {
        try {
            const { id } = req.params;
            const ebook = await Ebook.findByPk(id);
            if (!ebook) return res.status(404).json({ error: 'Ebook not found' });

            ebook.is_featured = true;
            await ebook.save();

            return res.json({ message: 'Ebook marked as featured.' });
        } catch (err) {
            console.error('Error featuring Ebook:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async unfeatureEbook(req, res) {
        try {
            const { id } = req.params;
            const ebook = await Ebook.findByPk(id);
            if (!ebook) return res.status(404).json({ error: 'Ebook not found' });

            ebook.is_featured = false;
            await ebook.save();

            return res.json({ message: 'Ebook removed from featured.' });
        } catch (err) {
            console.error('Error unfeaturing Ebook:', err);
            return res.status(500).json({ error: err.message });
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
            const categories = await EbookCategory.findAll({
                where: { is_active: true },
                include: [{
                    model: EbookSubCategory,
                    where: { is_active: true },
                    required: false,
                }],
            });
            res.json(categories);
        } catch (err) {
            console.error('Error fetching categories:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async createEbookSubCategory(req, res) {
        try {
            const { name, description, category_id } = req.body;
            if (!name || !category_id) {
                return res.status(400).json({ error: 'name and category_id are required' });
            }

            const subCategory = await EbookSubCategory.create({
                name,
                description,
                category_id,
            });

            return res.status(201).json(subCategory);
        } catch (err) {
            console.error('Error creating ebook subcategory:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getEbookSubCategories(req, res) {
        try {
            const whereClause = { is_active: true };
            if (req.params.categoryId) {
                whereClause.category_id = req.params.categoryId;
            }

            const subCategories = await EbookSubCategory.findAll({
                where: whereClause,
                order: [['name', 'ASC']],
            });

            return res.json(subCategories);
        } catch (err) {
            console.error('Error fetching ebook subcategories:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async updateEbookSubCategory(req, res) {
        try {
            const subCategory = await EbookSubCategory.findByPk(req.params.id);
            if (!subCategory) {
                return res.status(404).json({ error: 'Subcategory not found' });
            }

            const { name, description, category_id, is_active } = req.body;
            if (name !== undefined) subCategory.name = name;
            if (description !== undefined) subCategory.description = description;
            if (category_id !== undefined) subCategory.category_id = category_id;
            if (is_active !== undefined) subCategory.is_active = is_active;

            await subCategory.save();
            return res.json(subCategory);
        } catch (err) {
            console.error('Error updating ebook subcategory:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async deleteEbookSubCategory(req, res) {
        try {
            const subCategory = await EbookSubCategory.findByPk(req.params.id);
            if (!subCategory) {
                return res.status(404).json({ error: 'Subcategory not found' });
            }

            await subCategory.destroy();
            return res.json({ message: 'Subcategory deleted successfully' });
        } catch (err) {
            console.error('Error deleting ebook subcategory:', err);
            return res.status(500).json({ error: err.message });
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
                order_id: `EBOOK-${Date.now()}`,
                user_id: req.user.id,
                Ebook_id: ebookId,
                price_paid: Ebook.price,
                payment_status: 'completed',
                paid_at: new Date(),
            });

            console.log('Ebook purchased:', order);
            res.status(201).json({ message: 'Purchase successful', order });
        } catch (err) {
            console.error('Error purchasing Ebook:', err);
            res.status(500).json({ error: err.message });
        }
    },

    async createCheckoutOrder(req, res) {
        try {
            const {
                ebook_id,
                payment_method,
                customer_email,
                customer_phone,
                customer_address,
                note,
                delivery_method,
            } = req.body;

            if (!ebook_id || !payment_method || !customer_email || !customer_phone) {
                return res.status(400).json({ error: 'Missing required checkout fields' });
            }

            const ebook = await Ebook.findByPk(ebook_id);
            if (!ebook || !ebook.is_approved) {
                return res.status(404).json({ error: 'Ebook not found or not approved' });
            }

            const existing = await EbookOrder.findOne({
                where: {
                    user_id: req.user.id,
                    Ebook_id: ebook_id,
                    payment_status: 'completed',
                },
            });

            if (existing) {
                return res.status(409).json({ error: 'You already purchased this ebook' });
            }

            const order = await EbookOrder.create({
                order_id: `EBOOK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                user_id: req.user.id,
                Ebook_id: ebook_id,
                price_paid: ebook.price,
                payment_method,
                customer_email,
                customer_phone,
                customer_address: customer_address || null,
                note: note || null,
                delivery_method: delivery_method || 'digital_download',
                payment_status: 'completed',
                paid_at: new Date(),
                purchased_at: new Date(),
                transaction_id: `TXN-${Date.now()}`,
                metadata: {
                    checkout_source: 'mobile_app',
                },
            });

            return res.status(201).json({
                message: 'Ebook order created successfully',
                order,
            });
        } catch (err) {
            console.error('Error creating ebook checkout order:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getPurchaseStatus(req, res) {
        try {
            const order = await EbookOrder.findOne({
                where: {
                    user_id: req.user.id,
                    Ebook_id: req.params.id,
                    payment_status: 'completed',
                },
            });

            return res.json({ isPurchased: !!order, order: order || null });
        } catch (err) {
            console.error('Error checking ebook purchase status:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async updateEbook(req, res) {
        try {
            const { id } = req.params;
            console.log('User', req.user.id, 'attempting to update Ebook:', id);
            const Ebook = await Ebook.findByPk(id);
            if (!Ebook || (Ebook.author_id !== req.user.id && req.user.role !== 'admin'))
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
            if (!Ebook || (Ebook.author_id !== req.user.id && req.user.role !== 'admin'))
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
                include: [EbookCategory, EbookSubCategory, User],
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
