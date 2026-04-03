const { OrderItem, Product, Order, User, Ebook, EbookOrder } = require('../models');
const { Sequelize } = require('sequelize');
const { buildPublicMediaUrl } = require('../utils/publicMediaUrl');

function getHost(req) {
    return `${req.protocol}://${req.get('host')}`;
}

function normalizeImages(images, host) {
    if (Array.isArray(images)) {
        return images
            .map((item) => buildPublicMediaUrl(item, host))
            .filter(Boolean);
    }

    if (typeof images === 'string' && images.trim()) {
        try {
            const parsed = JSON.parse(images);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((item) => buildPublicMediaUrl(item, host))
                    .filter(Boolean);
            }
        } catch (_) {
            const single = buildPublicMediaUrl(images, host);
            return single ? [single] : [];
        }
    }

    return [];
}

module.exports = {
    async topProducts(req, res) {
        try {
            const host = getHost(req);
            const results = await OrderItem.findAll({
                attributes: [
                    'ProductId',
                    [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalOrders'],
                ],
                include: [
                    {
                        model: Product,
                        attributes: [
                            'id',
                            'name',
                            'price',
                            'images',
                            'market_region',
                            'origin_region',
                            'origin_town',
                            'seller_id',
                        ],
                        include: [
                            {
                                model: User,
                                as: 'seller',
                                attributes: ['id', 'full_name', 'address', 'profile_image'],
                                required: false,
                            },
                        ],
                    },
                ],
                group: ['ProductId', 'Product.id', 'Product->seller.id'],
                order: [[Sequelize.literal('totalOrders'), 'DESC']],
                limit: 10,
            });

            const formattedResults = results
                .map((item) => {
                    const raw = item.toJSON();
                    const product = raw.Product;
                    if (!product) return null;

                    const seller = product.seller || null;
                    const images = normalizeImages(product.images, host);

                    return {
                        ...raw,
                        Product: {
                            ...product,
                            images,
                            image: images[0] || null,
                            region:
                                product.market_region ||
                                product.origin_region ||
                                seller?.address ||
                                null,
                            location:
                                product.origin_town ||
                                product.market_region ||
                                product.origin_region ||
                                seller?.address ||
                                null,
                            seller: seller
                                ? {
                                    ...seller,
                                    profile_image: buildPublicMediaUrl(
                                        seller.profile_image,
                                        host,
                                    ),
                                }
                                : null,
                        },
                    };
                })
                .filter(Boolean);

            return res.json(formattedResults);
        } catch (error) {
            console.error('Error fetching top products:', error.message);
            return res.status(500).json({ error: error.message });
        }
    },

    async topSellers(req, res) {
        try {
            const host = getHost(req);
            const deliveredItems = await OrderItem.findAll({
                include: [
                    {
                        model: Order,
                        attributes: ['id', 'status'],
                        where: { status: 'delivered' },
                        required: true,
                    },
                    {
                        model: Product,
                        attributes: [
                            'id',
                            'seller_id',
                            'market_region',
                            'origin_region',
                            'origin_town',
                        ],
                        required: true,
                    },
                ],
                order: [['createdAt', 'DESC']],
            });

            const sellerStats = new Map();

            for (const item of deliveredItems) {
                const raw = item.toJSON();
                const product = raw.Product;
                const sellerId = Number(product?.seller_id);
                if (!sellerId) continue;

                const current = sellerStats.get(sellerId) || {
                    sellerId,
                    totalOrders: 0,
                    totalUnits: 0,
                    regions: new Set(),
                    towns: new Set(),
                };

                current.totalOrders += 1;
                current.totalUnits += Number(raw.quantity || 0);
                if (product.market_region) current.regions.add(product.market_region);
                if (product.origin_region) current.regions.add(product.origin_region);
                if (product.origin_town) current.towns.add(product.origin_town);
                sellerStats.set(sellerId, current);
            }

            const rankedSellerIds = [...sellerStats.values()]
                .sort((a, b) => {
                    if (b.totalOrders !== a.totalOrders) {
                        return b.totalOrders - a.totalOrders;
                    }
                    return b.totalUnits - a.totalUnits;
                })
                .slice(0, 5)
                .map((item) => item.sellerId);

            if (!rankedSellerIds.length) {
                return res.json([]);
            }

            const sellers = await User.findAll({
                where: { id: rankedSellerIds },
                attributes: ['id', 'full_name', 'email', 'address', 'profile_image'],
            });

            const sellersById = new Map(
                sellers.map((seller) => [Number(seller.id), seller.toJSON()]),
            );

            const response = rankedSellerIds
                .map((sellerId) => {
                    const stats = sellerStats.get(sellerId);
                    const user = sellersById.get(sellerId);
                    if (!stats || !user) return null;

                    const regions = [...stats.regions].filter(Boolean);
                    const towns = [...stats.towns].filter(Boolean);
                    return {
                        seller_id: sellerId,
                        totalOrders: stats.totalOrders,
                        totalUnits: stats.totalUnits,
                        region: regions[0] || user.address || null,
                        location: towns[0] || regions[0] || user.address || null,
                        User: {
                            ...user,
                            profile_image: buildPublicMediaUrl(user.profile_image, host),
                        },
                    };
                })
                .filter(Boolean);

            return res.json(response);
        } catch (error) {
            console.error('Error fetching top sellers:', error.message);
            return res.status(500).json({ error: error.message });
        }
    },

    async topAuthors(req, res) {
        try {
            const host = getHost(req);
            const completedOrders = await EbookOrder.findAll({
                where: { payment_status: 'completed' },
                include: [
                    {
                        model: Ebook,
                        attributes: ['id', 'author_id', 'cover_image', 'category_id'],
                        required: true,
                    },
                ],
                order: [['createdAt', 'DESC']],
            });

            const authorStats = new Map();

            for (const order of completedOrders) {
                const raw = order.toJSON();
                const ebook = raw.Ebook;
                const authorId = Number(ebook?.author_id);
                if (!authorId) continue;

                const current = authorStats.get(authorId) || {
                    authorId,
                    totalOrders: 0,
                    totalRevenue: 0,
                    featuredCover: null,
                };

                current.totalOrders += 1;
                current.totalRevenue += Number(raw.price_paid || 0);
                if (!current.featuredCover && ebook?.cover_image) {
                    current.featuredCover = buildPublicMediaUrl(ebook.cover_image, host);
                }
                authorStats.set(authorId, current);
            }

            const rankedAuthorIds = [...authorStats.values()]
                .sort((a, b) => {
                    if (b.totalOrders !== a.totalOrders) {
                        return b.totalOrders - a.totalOrders;
                    }
                    return b.totalRevenue - a.totalRevenue;
                })
                .slice(0, 5)
                .map((item) => item.authorId);

            if (!rankedAuthorIds.length) {
                return res.json([]);
            }

            const authors = await User.findAll({
                where: { id: rankedAuthorIds },
                attributes: ['id', 'full_name', 'email', 'address', 'profile_image'],
            });

            const authorsById = new Map(
                authors.map((author) => [Number(author.id), author.toJSON()]),
            );

            const response = rankedAuthorIds
                .map((authorId) => {
                    const stats = authorStats.get(authorId);
                    const user = authorsById.get(authorId);
                    if (!stats || !user) return null;

                    return {
                        author_id: authorId,
                        totalOrders: stats.totalOrders,
                        totalRevenue: Number(stats.totalRevenue.toFixed(2)),
                        featured_cover: stats.featuredCover,
                        User: {
                            ...user,
                            profile_image: buildPublicMediaUrl(user.profile_image, host),
                        },
                    };
                })
                .filter(Boolean);

            return res.json(response);
        } catch (error) {
            console.error('Error fetching top authors:', error.message);
            return res.status(500).json({ error: error.message });
        }
    },
};
