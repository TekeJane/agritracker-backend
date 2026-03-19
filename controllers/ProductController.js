const { Product, Category, SubCategory, User } = require('../models');        
function formatProduct(product, hostUrl) {
    console.log(`\n🔄 Formatting product ID=${product.id}`);

    const now = new Date();

    let updatedImages = [];
    let updatedVideos = [];
    try {
        if (Array.isArray(product.images)) {
            updatedImages = product.images;
            console.log(`🖼️ Images already array for product ${product.id}`);
        } else if (typeof product.images === 'string') {
            updatedImages = JSON.parse(product.images);
            console.log(`🧾 Parsed string images for product ${product.id}`);
        }

        updatedImages = updatedImages.map(img => {
            const fullUrl = img.startsWith('http') ? img : `${hostUrl}${img.startsWith('/') ? '' : '/'}${img}`;
            console.log(`➡️ Image URL: ${fullUrl}`);
            return fullUrl;
        });
    } catch (e) {
        console.warn(`⚠️ Failed to parse images for product ID ${product.id}: ${e}`);
    }

    try {
        if (Array.isArray(product.videos)) {
            updatedVideos = product.videos;
        } else if (typeof product.videos === 'string') {
            updatedVideos = JSON.parse(product.videos);
        }

        updatedVideos = updatedVideos.map(video => {
            const fullUrl = video.startsWith('http')
                ? video
                : `${hostUrl}${video.startsWith('/') ? '' : '/'}${video}`;
            return fullUrl;
        });
    } catch (e) {
        console.warn(`⚠️ Failed to parse videos for product ID ${product.id}: ${e}`);
    }

    const isNew = new Date(product.createdAt) >= new Date(now - 48 * 60 * 60 * 1000);
    console.log(`🆕 isNew = ${isNew} for product ${product.id}`);

    const seller = product.seller || {};
    const category = product.Category || {};
    const subCategory = product.SubCategory || {};

    const result = {
        ...product.toJSON(),
        images: updatedImages,
        videos: updatedVideos,
        isNew,
        userId: seller.id || null,
        sellerName: seller.full_name || 'Anonymous',
        sellerImage: seller.profile_image ? `${hostUrl}/uploads/${seller.profile_image}` : null,
        sellerBio: seller.bio || '',
        facEbook: seller.facEbook || null,
        instagram: seller.instagram || null,
        twitter: seller.twitter || null,
        tiktok: seller.tiktok || null,
        category_name: category.name || null,
        sub_category_name: subCategory.name || null,
        is_preorder: product.is_preorder || false,
        preorder_days: product.preorder_days || null,
        preorder_available_date: product.preorder_available_date || null,
    };

    console.log(`✅ Final formatted product:`, result);
    return result;
}

const ProductController = {
    async getAllProducts(req, res) {
        console.log('\n📥 GET all active products');
        try {
            const products = await Product.findAll({
                where: { is_active: true },
                include: [Category, SubCategory, { model: User, as: 'seller' }],
                order: [['createdAt', 'DESC']],
            });

            console.log(`🔢 Total products fetched: ${products.length}`);
            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const formatted = products.map(p => formatProduct(p, hostUrl));

            return res.status(200).json(formatted);
        } catch (error) {
            console.error('❌ Error in getAllProducts:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getFeaturedProducts(req, res) {
        console.log('\n📥 GET featured products');
        try {
            const products = await Product.findAll({
                where: { is_active: true, is_featured: true },
                include: [Category, SubCategory, { model: User, as: 'seller' }],
                order: [['createdAt', 'DESC']],
            });

            console.log(`🌟 Total featured products: ${products.length}`);
            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const formatted = products.map(p => formatProduct(p, hostUrl));

            return res.status(200).json(formatted);
        } catch (error) {
            console.error('❌ Error in getFeaturedProducts:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getProductById(req, res) {
        console.log(`\n📥 GET product by ID: ${req.params.id}`);
        try {
            const product = await Product.findByPk(req.params.id, {
                include: [Category, SubCategory, { model: User, as: 'seller' }],
            });

            if (!product) {
                console.warn('⚠️ Product not found:', req.params.id);
                return res.status(404).json({ message: 'Product not found' });
            }

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const formatted = formatProduct(product, hostUrl);

            return res.status(200).json(formatted);
        } catch (error) {
            console.error('❌ Error in getProductById:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getProductsByCategory(req, res) {
        console.log(`\n📥 GET products by category ID: ${req.params.categoryId}`);
        try {
            const products = await Product.findAll({
                where: { CategoryId: req.params.categoryId, is_active: true },
                include: [Category, SubCategory, { model: User, as: 'seller' }],
                order: [['createdAt', 'DESC']],
            });

            console.log(`🔢 Fetched ${products.length} products for category ${req.params.categoryId}`);
            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const formatted = products.map(p => formatProduct(p, hostUrl));

            return res.status(200).json(formatted);
        } catch (error) {
            console.error('❌ Error in getProductsByCategory:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getProductsBySubCategory(req, res) {
        console.log(`\n📥 GET products by subcategory ID: ${req.params.subCategoryId}`);
        try {
            const products = await Product.findAll({
                where: { SubCategoryId: req.params.subCategoryId, is_active: true },
                include: [Category, SubCategory, { model: User, as: 'seller' }],
                order: [['createdAt', 'DESC']],
            });

            console.log(`🔢 Fetched ${products.length} products for subcategory ${req.params.subCategoryId}`);
            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const formatted = products.map(p => formatProduct(p, hostUrl));

            return res.status(200).json(formatted);
        } catch (error) {
            console.error('❌ Error in getProductsBySubCategory:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async createProduct(req, res) {
        console.log('\n📥 CREATE product with data:', req.body);
        try {
            const {
                name,
                description,
                price,
                stock,
                unit,
                categoryId,
                subCategoryId,
                isFeatured,
                sellerId,
                isPreorder,
                preorderDays,
            } = req.body;

            const imageFiles = req.files?.images || [];
            const videoFiles = req.files?.videos || [];

            const imageUrls = imageFiles.map(file => {
                const url = `/uploads/${file.filename}`;
                console.log('📎 Uploaded image URL:', url);
                return url;
            });

            const videoUrls = videoFiles.map(file => {
                const url = `/uploads/${file.filename}`;
                console.log('🎬 Uploaded video URL:', url);
                return url;
            });

            const isPreorderBool = isPreorder === 'true' || isPreorder === true;
            const parsedPreorderDays =
                preorderDays !== undefined && preorderDays !== null && preorderDays !== ''
                    ? parseInt(preorderDays)
                    : null;
            const preorderAvailableDate =
                isPreorderBool && parsedPreorderDays
                    ? new Date(Date.now() + parsedPreorderDays * 24 * 60 * 60 * 1000)
                    : null;

            const newProduct = {
                name,
                description,
                price: parseFloat(price),
                stock_quantity: parseInt(stock),
                unit,
                is_featured: isFeatured === 'true',
                is_active: true,
                images: imageUrls,
                videos: videoUrls,
                CategoryId: parseInt(categoryId),
                SubCategoryId: parseInt(subCategoryId),
                seller_id: parseInt(sellerId),
                is_preorder: isPreorderBool,
                preorder_days: parsedPreorderDays,
                preorder_available_date: preorderAvailableDate,
            };

            console.log('📦 Product to create:', newProduct);

            const product = await Product.create(newProduct);
            console.log('✅ Product created:', product.toJSON());

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const formatted = formatProduct(product, hostUrl);

            return res.status(201).json(formatted);
        } catch (error) {
            console.error('❌ Error in createProduct:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async updateProduct(req, res) {
        console.log(`\n📥 UPDATE product ID: ${req.params.id}`);
        try {
            const [updated] = await Product.update(req.body, {
                where: { id: req.params.id },
            });

            if (updated) {
                const updatedProduct = await Product.findByPk(req.params.id, {
                    include: [Category, SubCategory, { model: User, as: 'seller' }],
                });

                console.log('✅ Updated product found:', updatedProduct.toJSON());

                const hostUrl = `${req.protocol}://${req.get('host')}`;
                const formatted = formatProduct(updatedProduct, hostUrl);

                return res.status(200).json(formatted);
            }

            console.warn('⚠️ Product not found to update:', req.params.id);
            return res.status(404).json({ message: 'Product not found' });
        } catch (error) {
            console.error('❌ Error in updateProduct:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async deleteProduct(req, res) {
        console.log(`\n📥 DELETE product ID: ${req.params.id}`);
        try {
            const deleted = await Product.destroy({ where: { id: req.params.id } });

            if (deleted) {
                console.log('✅ Product deleted:', req.params.id);
                return res.status(204).send();
            }

            console.warn('⚠️ Product not found to delete:', req.params.id);
            return res.status(404).json({ message: 'Product not found' });
        } catch (error) {
            console.error('❌ Error in deleteProduct:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async markAsFeatured(req, res) {
        console.log(`\n📌 MARK AS FEATURED product ID: ${req.params.id}`);
        try {
            const product = await Product.findByPk(req.params.id, {
                include: [Category, SubCategory, { model: User, as: 'seller' }],
            });

            if (!product) {
                console.warn('⚠️ Product not found to feature:', req.params.id);
                return res.status(404).json({ message: 'Product not found' });
            }

            product.is_featured = true;
            await product.save();

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const formatted = formatProduct(product, hostUrl);

            console.log('✅ Product marked as featured:', product.id);
            return res.status(200).json(formatted);
        } catch (error) {
            console.error('❌ Error in markAsFeatured:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async unmarkAsFeatured(req, res) {
        console.log(`\n📌 UNMARK FEATURED product ID: ${req.params.id}`);
        try {
            const product = await Product.findByPk(req.params.id, {
                include: [Category, SubCategory, { model: User, as: 'seller' }],
            });

            if (!product) {
                console.warn('⚠️ Product not found to unfeature:', req.params.id);
                return res.status(404).json({ message: 'Product not found' });
            }

            product.is_featured = false;
            await product.save();

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const formatted = formatProduct(product, hostUrl);

            console.log('✅ Product unmarked as featured:', product.id);
            return res.status(200).json(formatted);
        } catch (error) {
            console.error('❌ Error in unmarkAsFeatured:', error);
            return res.status(500).json({ error: error.message });
        }
    },

};

module.exports = ProductController;
