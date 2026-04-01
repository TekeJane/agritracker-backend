const { Product, Category, SubCategory, User, OrderItem, Order, sequelize } = require('../models');
const { Op } = require('sequelize');
const TOP_MARKETPLACE_THRESHOLD = 50;

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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildAppDeepLinkUrl(type, id) {
    return `agritracker://${type}/${id}`;
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
        order_count: Number(product.get?.('order_count') ?? product.order_count ?? 0),
        orderCount: Number(product.get?.('order_count') ?? product.order_count ?? 0),
        is_top_seller_item: Number(product.get?.('order_count') ?? product.order_count ?? 0) >= TOP_MARKETPLACE_THRESHOLD,
        isTopSellerItem: Number(product.get?.('order_count') ?? product.order_count ?? 0) >= TOP_MARKETPLACE_THRESHOLD,
    };
}

async function attachProductOrderCounts(products) {
    if (!Array.isArray(products) || products.length === 0) {
        return products;
    }

    const productIds = products.map((product) => Number(product.id)).filter(Boolean);
    if (productIds.length === 0) {
        return products;
    }

    const orderCounts = await OrderItem.findAll({
        attributes: [
            'ProductId',
            [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('OrderItem.OrderId'))), 'order_count'],
        ],
        where: {
            ProductId: productIds,
        },
        include: [
            {
                model: Order,
                attributes: [],
                where: {
                    status: { [Op.ne]: 'cancelled' },
                },
                required: true,
            },
        ],
        group: ['ProductId'],
        raw: true,
    });

    const countsByProductId = new Map(
        orderCounts.map((row) => [Number(row.ProductId), Number(row.order_count || 0)]),
    );

    for (const product of products) {
        product.setDataValue('order_count', countsByProductId.get(Number(product.id)) || 0);
    }

    return products;
}

function sortProductsByMarketplacePriority(products) {
    return [...products].sort((a, b) => {
        const aCount = Number(a.get?.('order_count') ?? a.order_count ?? 0);
        const bCount = Number(b.get?.('order_count') ?? b.order_count ?? 0);
        const aTop = aCount >= TOP_MARKETPLACE_THRESHOLD ? 1 : 0;
        const bTop = bCount >= TOP_MARKETPLACE_THRESHOLD ? 1 : 0;

        if (aTop != bTop) return bTop - aTop;
        if (aCount != bCount) return bCount - aCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
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
            await attachProductOrderCounts(products);
            const rankedProducts = sortProductsByMarketplacePriority(products);

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(rankedProducts.map((product) => formatProduct(product, hostUrl)));
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
            await attachProductOrderCounts(products);
            const rankedProducts = sortProductsByMarketplacePriority(products);

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(rankedProducts.map((product) => formatProduct(product, hostUrl)));
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

            await attachProductOrderCounts([product]);
            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(formatProduct(product, hostUrl));
        } catch (error) {
            console.error('Error in getProductById:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getPurchaseStatus(req, res) {
        try {
            const orderItem = await OrderItem.findOne({
                where: { ProductId: req.params.id },
                include: [
                    {
                        model: Order,
                        required: true,
                        where: {
                            UserId: req.user.id,
                            payment_status: {
                                [Op.in]: ['paid', 'completed'],
                            },
                            status: {
                                [Op.ne]: 'cancelled',
                            },
                        },
                    },
                ],
            });

            return res.json({
                isPurchased: !!orderItem,
                order: orderItem?.Order || null,
            });
        } catch (error) {
            console.error('Error checking product purchase status:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    async getProductSharePage(req, res) {
        try {
            const product = await fetchProductWithRelations(req.params.id);

            if (!product) {
                return res.status(404).send('<h1>Product not found</h1>');
            }

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const formattedProduct = formatProduct(product, hostUrl);
            const sellerName = formattedProduct.sellerFullName || formattedProduct.sellerName || 'Seller';
            const productImage = formattedProduct.images?.[0] || '';
            const productName = escapeHtml(formattedProduct.name);
            const productDescription = escapeHtml(formattedProduct.description || 'No description available.');
            const productPrice = Number(formattedProduct.price || 0).toFixed(0);
            const sellerStoreUrl = formattedProduct.userId
                ? `${hostUrl}/api/myprofile/${formattedProduct.userId}`
                : '';
            const shareUrl = `${hostUrl}/api/products/share/${formattedProduct.id}`;
            const appUrl = buildAppDeepLinkUrl('product', formattedProduct.id);
            const imageMarkup = productImage
                ? `<a href="${escapeHtml(appUrl)}" style="display:block;text-decoration:none;"><img src="${escapeHtml(productImage)}" alt="${productName}" style="width:100%;max-width:520px;height:280px;object-fit:cover;border-radius:24px;box-shadow:0 18px 40px rgba(15,23,42,0.16);" /></a>`
                : '<div style="width:100%;max-width:520px;height:280px;border-radius:24px;background:#d9f99d;display:flex;align-items:center;justify-content:center;color:#166534;font-size:20px;font-weight:700;">AgriTracker Product</div>';

            return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${productName} | AgriTracker</title>
    <meta name="description" content="${productDescription}" />
    <meta property="og:title" content="${productName}" />
    <meta property="og:description" content="${productDescription}" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta property="al:android:url" content="${escapeHtml(appUrl)}" />
    <meta property="al:ios:url" content="${escapeHtml(appUrl)}" />
    ${productImage ? `<meta property="og:image" content="${escapeHtml(productImage)}" />` : ''}
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.location.href = ${JSON.stringify(appUrl)};
        }, 180);
      });
    </script>
  </head>
  <body style="margin:0;font-family:Arial,sans-serif;background:linear-gradient(180deg,#f7fee7 0%,#ffffff 55%);color:#0f172a;">
    <main style="max-width:760px;margin:0 auto;padding:40px 20px 56px;">
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;font-size:13px;">AgriTracker Verified Product</div>
      <h1 style="margin:18px 0 12px;font-size:38px;line-height:1.1;color:#14532d;">${productName}</h1>
      <p style="margin:0 0 24px;font-size:17px;line-height:1.7;color:#475569;">${productDescription}</p>
      ${imageMarkup}
      <section style="margin-top:28px;padding:24px;border-radius:24px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,0.08);">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px;">
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Price</div><div style="margin-top:6px;font-size:28px;font-weight:800;color:#166534;">XAF ${escapeHtml(productPrice)}</div></div>
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Seller</div><div style="margin-top:6px;font-size:18px;font-weight:700;">${escapeHtml(sellerName)}</div></div>
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Company</div><div style="margin-top:6px;font-size:18px;font-weight:700;">AgriTracker</div></div>
        </div>
      </section>
      <section style="margin-top:20px;padding:24px;border-radius:24px;background:#14532d;color:#f0fdf4;">
        <div style="font-size:18px;font-weight:700;">Open this product in AgriTracker</div>
        <p style="margin:10px 0 18px;font-size:15px;line-height:1.6;color:#dcfce7;">This shared product now jumps straight into the marketplace app instead of showing a raw link page.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <a href="${escapeHtml(appUrl)}" style="display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:14px;background:#f0fdf4;color:#14532d;text-decoration:none;font-weight:700;">Open In App</a>
          ${sellerStoreUrl ? `<a href="${escapeHtml(sellerStoreUrl)}" style="display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:14px;border:1px solid rgba(240,253,244,0.45);color:#f0fdf4;text-decoration:none;font-weight:700;">Visit Seller Store</a>` : ''}
        </div>
      </section>
    </main>
  </body>
</html>`);
        } catch (error) {
            console.error('Error in getProductSharePage:', error);
            return res.status(500).send('<h1>Unable to load product</h1>');
        }
    },

    async getProductsByCategory(req, res) {
        try {
            const products = await Product.findAll({
                where: { CategoryId: req.params.categoryId, is_active: true },
                include: [Category, SubCategory, { model: User, as: 'seller' }],
                order: [['createdAt', 'DESC']],
            });
            await attachProductOrderCounts(products);
            const rankedProducts = sortProductsByMarketplacePriority(products);

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(rankedProducts.map((product) => formatProduct(product, hostUrl)));
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
            await attachProductOrderCounts(products);
            const rankedProducts = sortProductsByMarketplacePriority(products);

            const hostUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(200).json(rankedProducts.map((product) => formatProduct(product, hostUrl)));
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
