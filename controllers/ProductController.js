const { Product, Category, SubCategory, User } = require('../models');

function formatMediaUrls(mediaList, hostUrl) {
    if (!mediaList) {
        return [];
    }

    const items = Array.isArray(mediaList) ? mediaList : JSON.parse(mediaList);

    return items.map((item) => {
        if (!item) {
            return item;
        }

        if (item.startsWith('http')) {
            return item;
        }

        if (item.includes('/uploads/')) {
            return `${hostUrl}${item.startsWith('/') ? '' : '/'}${item}`;
        }

        return `${hostUrl}/uploads/${item.startsWith('/') ? item.replace(/^\/+/, '') : item}`;
    });
}

function buildUploadUrl(value, hostUrl) {
    if (!value) {
        return null;
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
    }

    if (value.startsWith('/uploads/')) {
        return `${hostUrl}${value}`;
    }

    if (value.startsWith('uploads/')) {
        return `${hostUrl}/${value}`;
    }

    return `${hostUrl}/uploads/${value.replace(/^\/+/, '')}`;
}

function formatProduct(product, hostUrl) {
    const now = new Date();

    let updatedImages = [];
    let updatedVideos = [];

    try {
        updatedImages = formatMediaUrls(product.images, hostUrl);
    } catch (error) {
        console.warn(`Failed to parse images for product ID ${product.id}:`, error.message);
    }

    try {
        updatedVideos = formatMediaUrls(product.videos, hostUrl);
    } catch (error) {
        console.warn(`Failed to parse videos for product ID ${product.id}:`, error.message);
    }

    const isNew = new Date(product.createdAt) >= new Date(now - 48 * 60 * 60 * 1000);
    const seller = product.seller || {};
    const category = product.Category || {};
    const subCategory = product.SubCategory || {};

    return {
        ...product.toJSON(),
        images: updatedImages,
        videos: updatedVideos,
        isNew,
        unit: product.unit || null,
        minimum_order_quantity: product.minimum_order_quantity || null,
        minimumOrderQuantity: product.minimum_order_quantity || null,
        variety: product.variety || null,
        harvest_date: product.harvest_date || null,
        harvestDate: product.harvest_date || null,
        shelf_life: product.shelf_life || null,
        shelfLife: product.shelf_life || null,
        origin_region: product.origin_region || null,
        originRegion: product.origin_region || null,
        origin_town: product.origin_town || null,
        originTown: product.origin_town || null,
        stock: product.stock_quantity,
        stockQuantity: product.stock_quantity,
        userId: seller.id || null,
        sellerName: seller.full_name || 'Anonymous',
        sellerFullName: seller.full_name || 'Anonymous',
        sellerImage: buildUploadUrl(seller.profile_image, hostUrl),
        sellerProfileImage: buildUploadUrl(seller.profile_image, hostUrl),
        sellerBio: seller.bio || '',
        facEbook: seller.facEbook || null,
        instagram: seller.instagram || null,
        twitter: seller.twitter || null,
        tiktok: seller.tiktok || null,
        category_name: category.name || null,
        categoryName: category.name || null,
        sub_category_name: subCategory.name || null,
        subCategoryName: subCategory.name || null,
        is_preorder: product.is_preorder || false,
        isPreorder: product.is_preorder || false,
        preorder_days: product.preorder_days || null,
        preorderDays: product.preorder_days || null,
        preorder_available_date: product.preorder_available_date || null,
        preorderAvailableDate: product.preorder_available_date || null,
    };
}

async function fetchProductWithRelations(productId) {
    return Product.findByPk(productId, {
        include: [Category, SubCategory, { model: User, as: 'seller' }],
    });
}

const ProductController = {
    async getAllProducts(req, res) {
        try {
            const products = await Product.findAll({
                where: { is_active: true },
                include: [Category, SubCategory, { model: User, as: 'seller' }],
                order: [['createdAt', 'DESC']],
            });

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(products.map((product) => formatProduct(product, hostUrl)));
        } catch (error) {
            console.error('Error in getAllProducts:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getFeaturedProducts(req, res) {
        try {
            const products = await Product.findAll({
                where: { is_active: true, is_featured: true },
                include: [Category, SubCategory, { model: User, as: 'seller' }],
                order: [['createdAt', 'DESC']],
            });

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(products.map((product) => formatProduct(product, hostUrl)));
        } catch (error) {
            console.error('Error in getFeaturedProducts:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getProductById(req, res) {
        try {
            const product = await fetchProductWithRelations(req.params.id);

            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(formatProduct(product, hostUrl));
        } catch (error) {
            console.error('Error in getProductById:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getProductsByCategory(req, res) {
        try {
            const products = await Product.findAll({
                where: { CategoryId: req.params.categoryId, is_active: true },
                include: [Category, SubCategory, { model: User, as: 'seller' }],
                order: [['createdAt', 'DESC']],
            });

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(products.map((product) => formatProduct(product, hostUrl)));
        } catch (error) {
            console.error('Error in getProductsByCategory:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getProductsBySubCategory(req, res) {
        try {
            const products = await Product.findAll({
                where: { SubCategoryId: req.params.subCategoryId, is_active: true },
                include: [Category, SubCategory, { model: User, as: 'seller' }],
                order: [['createdAt', 'DESC']],
            });

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(products.map((product) => formatProduct(product, hostUrl)));
        } catch (error) {
            console.error('Error in getProductsBySubCategory:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async createProduct(req, res) {
        try {
            const {
                name,
                description,
                price,
                stock,
                unit,
                minimumOrderQuantity,
                variety,
                harvestDate,
                shelfLife,
                originRegion,
                originTown,
                categoryId,
                subCategoryId,
                isFeatured,
                sellerId,
                isPreorder,
                preorderDays,
            } = req.body;

            if (!name || !price || !stock || !unit || !categoryId || !subCategoryId || !sellerId) {
                return res.status(400).json({ error: 'Missing required product fields' });
            }

            const imageFiles = req.files?.images || [];
            const videoFiles = req.files?.videos || [];

            if (imageFiles.length < 3) {
                return res.status(400).json({ error: 'At least 3 product images are required' });
            }

            const imageUrls = imageFiles.map((file) => `/uploads/${file.filename}`);
            const videoUrls = videoFiles.map((file) => `/uploads/${file.filename}`);

            const isPreorderBool = isPreorder === 'true' || isPreorder === true;
            const parsedPreorderDays =
                preorderDays !== undefined && preorderDays !== null && preorderDays !== ''
                    ? parseInt(preorderDays, 10)
                    : null;
            const preorderAvailableDate =
                isPreorderBool && parsedPreorderDays
                    ? new Date(Date.now() + parsedPreorderDays * 24 * 60 * 60 * 1000)
                    : null;

            const parsedMinimumOrderQuantity =
                minimumOrderQuantity !== undefined &&
                minimumOrderQuantity !== null &&
                minimumOrderQuantity !== ''
                    ? parseInt(minimumOrderQuantity, 10)
                    : null;

            const product = await Product.create({
                name,
                description,
                price: parseFloat(price),
                stock_quantity: parseInt(stock, 10),
                unit,
                minimum_order_quantity: parsedMinimumOrderQuantity,
                variety: variety || null,
                harvest_date: harvestDate || null,
                shelf_life: shelfLife || null,
                origin_region: originRegion || null,
                origin_town: originTown || null,
                is_featured: isFeatured === 'true' || isFeatured === true,
                is_active: true,
                images: imageUrls,
                videos: videoUrls,
                CategoryId: parseInt(categoryId, 10),
                SubCategoryId: parseInt(subCategoryId, 10),
                seller_id: parseInt(sellerId, 10),
                is_preorder: isPreorderBool,
                preorder_days: parsedPreorderDays,
                preorder_available_date: preorderAvailableDate,
            });

            const fullProduct = await fetchProductWithRelations(product.id);
            const hostUrl = `${req.protocol}://${req.get('host')}`;

            return res.status(201).json(formatProduct(fullProduct, hostUrl));
        } catch (error) {
            console.error('Error in createProduct:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async updateProduct(req, res) {
        try {
            const [updated] = await Product.update(req.body, {
                where: { id: req.params.id },
            });

            if (!updated) {
                return res.status(404).json({ message: 'Product not found' });
            }

            const updatedProduct = await fetchProductWithRelations(req.params.id);
            const hostUrl = `${req.protocol}://${req.get('host')}`;

            return res.status(200).json(formatProduct(updatedProduct, hostUrl));
        } catch (error) {
            console.error('Error in updateProduct:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async deleteProduct(req, res) {
        try {
            const deleted = await Product.destroy({ where: { id: req.params.id } });

            if (!deleted) {
                return res.status(404).json({ message: 'Product not found' });
            }

            return res.status(204).send();
        } catch (error) {
            console.error('Error in deleteProduct:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async markAsFeatured(req, res) {
        try {
            const product = await fetchProductWithRelations(req.params.id);

            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            product.is_featured = true;
            await product.save();

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(formatProduct(product, hostUrl));
        } catch (error) {
            console.error('Error in markAsFeatured:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async unmarkAsFeatured(req, res) {
        try {
            const product = await fetchProductWithRelations(req.params.id);

            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            product.is_featured = false;
            await product.save();

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(formatProduct(product, hostUrl));
        } catch (error) {
            console.error('Error in unmarkAsFeatured:', error);
            return res.status(500).json({ error: error.message });
        }
    },
};

module.exports = ProductController;
