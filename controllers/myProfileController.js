const { User, Product, Review, Ebook, EbookCategory, EbookSubCategory, EbookOrder, OrderItem, Order, sequelize } = require('../models');
const { Op } = require('sequelize');
const { toUploadDbPath } = require('../config/uploadPaths');
const TOP_MARKETPLACE_THRESHOLD = 50;

const getBaseUrl = (req) => {
    const envBaseUrl =
        process.env.BASE_URL ||
        process.env.BACKEND_PUBLIC_URL ||
        process.env.APP_BASE_URL;
    if (envBaseUrl && envBaseUrl.trim().length > 0) {
        return envBaseUrl.endsWith('/') ? envBaseUrl : `${envBaseUrl}/`;
    }
    return `${req.protocol}://${req.get('host')}/`;
};

const toRoundedRating = (value) => parseFloat(Number(value || 0).toFixed(1));

const getReviewMetrics = (reviews) => {
    const normalizedReviews = Array.isArray(reviews) ? reviews : [];
    const count = normalizedReviews.length;
    const total = normalizedReviews.reduce(
        (sum, review) => sum + Number(review?.rating || 0),
        0
    );

    return {
        count,
        average: count > 0 ? total / count : 0,
    };
};

const buildMediaUrl = (baseUrl, value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        return raw;
    }
    const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.startsWith('uploads/')) {
        return `${baseUrl}${normalized}`;
    }
    return `${baseUrl}uploads/${normalized}`;
};

const buildUserResponse = (
    user,
    baseUrl,
    sellerAverageRating = null,
    sellerReviewCount = null,
    authorAverageRating = null,
    authorReviewCount = null,
    authorOrderCount = 0,
    sellerOrderCount = 0
) => {
    const safeSellerReviewCount = sellerReviewCount ?? 0;
    const safeAuthorReviewCount = authorReviewCount ?? 0;
    const safeSellerAverageRating = typeof sellerAverageRating === 'number' ? sellerAverageRating : 0;
    const safeAuthorAverageRating = typeof authorAverageRating === 'number' ? authorAverageRating : 0;
    const combinedReviewCount = safeSellerReviewCount + safeAuthorReviewCount;
    const weightedRatingTotal =
        (safeSellerAverageRating * safeSellerReviewCount) +
        (safeAuthorAverageRating * safeAuthorReviewCount);
    const averageRating =
        combinedReviewCount > 0
            ? weightedRatingTotal / combinedReviewCount
            : user.reviews?.length > 0
                ? user.reviews.reduce((acc, r) => acc + r.rating, 0) / user.reviews.length
                : 0;
    const roundedAverageRating = toRoundedRating(averageRating);
    const roundedSellerAverageRating = toRoundedRating(safeSellerAverageRating);
    const roundedAuthorAverageRating = toRoundedRating(safeAuthorAverageRating);

    return {
        id: user.id,
        full_name: user.full_name,
        account_type: user.account_type || null,
        role: user.account_type || null,
        email: user.email,
        phone: user.phone,
        address: user.address,
        date_of_birth: user.date_of_birth,
        profile_image: user.profile_image
            ? buildMediaUrl(baseUrl, user.profile_image)
            : null,
        bio: user.bio,
        facEbook: user.facEbook,
        facebook: user.facEbook,
        instagram: user.instagram,
        twitter: user.twitter,
        tiktok: user.tiktok,
        whatsapp: user.phone,
        created_at: user.createdAt,
        rating: roundedAverageRating,
        average_rating: roundedAverageRating,
        joined_rating: roundedAverageRating,
        combined_review_count: combinedReviewCount,
        joined_review_count: combinedReviewCount,
        seller_rating: roundedSellerAverageRating,
        seller_average_rating: roundedSellerAverageRating,
        seller_review_count: safeSellerReviewCount,
        author_rating: roundedAuthorAverageRating,
        author_average_rating: roundedAuthorAverageRating,
        author_review_count: safeAuthorReviewCount,
        author_order_count: authorOrderCount,
        seller_order_count: sellerOrderCount,
        products: (user.products ?? []).map((product) => {
            const item = product.toJSON ? product.toJSON() : product;
            const orderCount = Number(item.order_count || 0);
            const productReviewMetrics = getReviewMetrics(item.Reviews);
            return {
                ...item,
                order_count: orderCount,
                orderCount,
                ratings_count: productReviewMetrics.count,
                ratings_average: toRoundedRating(productReviewMetrics.average),
                is_top_seller_item: orderCount >= TOP_MARKETPLACE_THRESHOLD,
                isTopSellerItem: orderCount >= TOP_MARKETPLACE_THRESHOLD,
            };
        }),
        ebooks: (user.Ebooks ?? []).map((ebook) => {
            const item = ebook.toJSON ? ebook.toJSON() : ebook;
            const orderCount = Number(item.order_count || 0);
            const ebookReviewMetrics = getReviewMetrics(item.Reviews);

            return {
                ...item,
                order_count: orderCount,
                orderCount,
                is_top_author_item: orderCount >= TOP_MARKETPLACE_THRESHOLD,
                isTopAuthorItem: orderCount >= TOP_MARKETPLACE_THRESHOLD,
                ratings_count: ebookReviewMetrics.count,
                ratings_average: toRoundedRating(ebookReviewMetrics.average),
                cover_image: buildMediaUrl(baseUrl, item.cover_image),
                gallery_images: (item.gallery_images ?? []).map((image) =>
                    buildMediaUrl(baseUrl, image)
                ),
                file_url: buildMediaUrl(baseUrl, item.file_url),
                category_name: item.EbookCategory?.name ?? null,
                sub_category_name: item.EbookSubCategory?.name ?? null,
                author_name: user.full_name,
            };
        }),
    };
};

async function attachProductOrderCounts(products) {
    if (!Array.isArray(products) || products.length === 0) return products;

    const productIds = products.map((product) => Number(product.id)).filter(Boolean);
    if (productIds.length === 0) return products;

    const orderCounts = await OrderItem.findAll({
        attributes: [
            'ProductId',
            [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('OrderItem.OrderId'))), 'order_count'],
        ],
        where: { ProductId: productIds },
        include: [
            {
                model: Order,
                attributes: [],
                required: true,
                where: { status: { [Op.ne]: 'cancelled' } },
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

    products.sort((a, b) => {
        const aCount = Number(a.get?.('order_count') ?? a.order_count ?? 0);
        const bCount = Number(b.get?.('order_count') ?? b.order_count ?? 0);
        const aTop = aCount >= TOP_MARKETPLACE_THRESHOLD ? 1 : 0;
        const bTop = bCount >= TOP_MARKETPLACE_THRESHOLD ? 1 : 0;
        if (aTop !== bTop) return bTop - aTop;
        if (aCount !== bCount) return bCount - aCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return products;
}

async function attachEbookOrderCounts(ebooks) {
    if (!Array.isArray(ebooks) || ebooks.length === 0) return ebooks;

    const ebookIds = ebooks.map((ebook) => Number(ebook.id)).filter(Boolean);
    if (ebookIds.length === 0) return ebooks;

    const orderCounts = await EbookOrder.findAll({
        attributes: [
            'Ebook_id',
            [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
        ],
        where: {
            Ebook_id: ebookIds,
            payment_status: { [Op.in]: ['paid', 'completed'] },
        },
        group: ['Ebook_id'],
        raw: true,
    });

    const countsByEbookId = new Map(
        orderCounts.map((row) => [Number(row.Ebook_id), Number(row.order_count || 0)]),
    );

    for (const ebook of ebooks) {
        ebook.setDataValue('order_count', countsByEbookId.get(Number(ebook.id)) || 0);
    }

    ebooks.sort((a, b) => {
        const aCount = Number(a.get?.('order_count') ?? a.order_count ?? 0);
        const bCount = Number(b.get?.('order_count') ?? b.order_count ?? 0);
        const aTop = aCount >= TOP_MARKETPLACE_THRESHOLD ? 1 : 0;
        const bTop = bCount >= TOP_MARKETPLACE_THRESHOLD ? 1 : 0;
        if (aTop !== bTop) return bTop - aTop;
        if (aCount !== bCount) return bCount - aCount;
        return new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime();
    });

    return ebooks;
}

// ✅ Get profile of the logged-in user
const getMyProfile = async (req, res) => {
    console.log("➡️ Entered getMyProfile function");

    try {
        const userId = req.user?.id;
        console.log("🔑 Extracted user ID from token:", userId);

        if (!userId) {
            console.log("⚠️ No user ID found in request");
            return res.status(401).json({ message: 'Unauthorized' });
        }

        console.log("🔍 Searching for user in database...");
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password'] },
            include: [
                { model: Product, as: 'products', include: [{ model: Review, attributes: ['rating'], required: false }] },
                { model: Review, as: 'reviews', attributes: ['rating'] },
                {
                    model: Ebook,
                    include: [EbookCategory, EbookSubCategory, { model: Review, attributes: ['rating'] }],
                },
            ]
        });

        if (!user) {
            console.log("❌ User not found in database");
            return res.status(404).json({ message: 'User not found' });
        }

        console.log("✅ User found:", {
            id: user.id,
            full_name: user.full_name,
            profile_image: user.profile_image,
            productsCount: user.products?.length ?? 0,
            reviewsCount: user.reviews?.length ?? 0,
        });

        const sellerReviews = await Review.findAll({
            include: [{ model: Product, where: { seller_id: user.id }, attributes: [] }],
            attributes: ['rating']
        });
        const authorReviews = await Review.findAll({
            include: [{ model: Ebook, where: { author_id: user.id }, attributes: [] }],
            attributes: ['rating']
        });
        const authorOrdersCount = await EbookOrder.count({
            include: [{ model: Ebook, where: { author_id: user.id }, attributes: [] }],
        });
        const sellerOrdersCount = await OrderItem.count({
            distinct: true,
            col: 'OrderId',
            include: [
                { model: Product, where: { seller_id: user.id }, attributes: [], required: true },
                { model: Order, where: { status: { [Op.ne]: 'cancelled' } }, attributes: [], required: true },
            ],
        });
        await attachProductOrderCounts(user.products ?? []);
        await attachEbookOrderCounts(user.Ebooks ?? []);
        const sellerAverageRating = sellerReviews.length > 0
            ? sellerReviews.reduce((acc, r) => acc + r.rating, 0) / sellerReviews.length
            : 0;
        const authorAverageRating = authorReviews.length > 0
            ? authorReviews.reduce((acc, r) => acc + r.rating, 0) / authorReviews.length
            : 0;

        const responsePayload = buildUserResponse(
            user,
            getBaseUrl(req),
            sellerAverageRating,
            sellerReviews.length,
            authorAverageRating,
            authorReviews.length,
            authorOrdersCount,
            sellerOrdersCount
        );
        console.log("📦 Response payload being sent:", responsePayload);

        return res.status(200).json(responsePayload);

    } catch (error) {
        console.error("❌ Error during getMyProfile execution:", error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};


// ✅ Get public profile of another user
const getUserProfile = async (req, res) => {
    try {
        const userId = req.params.userId;

        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password'] },
            include: [
                { model: Product, as: 'products', include: [{ model: Review, attributes: ['rating'], required: false }] },
                { model: Review, as: 'reviews', attributes: ['rating'] },
                {
                    model: Ebook,
                    include: [EbookCategory, EbookSubCategory, { model: Review, attributes: ['rating'] }],
                },
            ]
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const sellerReviews = await Review.findAll({
            include: [{ model: Product, where: { seller_id: user.id }, attributes: [] }],
            attributes: ['rating']
        });
        const authorReviews = await Review.findAll({
            include: [{ model: Ebook, where: { author_id: user.id }, attributes: [] }],
            attributes: ['rating']
        });
        const authorOrdersCount = await EbookOrder.count({
            include: [{ model: Ebook, where: { author_id: user.id }, attributes: [] }],
        });
        const sellerOrdersCount = await OrderItem.count({
            distinct: true,
            col: 'OrderId',
            include: [
                { model: Product, where: { seller_id: user.id }, attributes: [], required: true },
                { model: Order, where: { status: { [Op.ne]: 'cancelled' } }, attributes: [], required: true },
            ],
        });
        await attachProductOrderCounts(user.products ?? []);
        await attachEbookOrderCounts(user.Ebooks ?? []);
        const sellerAverageRating = sellerReviews.length > 0
            ? sellerReviews.reduce((acc, r) => acc + r.rating, 0) / sellerReviews.length
            : 0;
        const authorAverageRating = authorReviews.length > 0
            ? authorReviews.reduce((acc, r) => acc + r.rating, 0) / authorReviews.length
            : 0;

        return res.status(200).json(
            buildUserResponse(
                user,
                getBaseUrl(req),
                sellerAverageRating,
                sellerReviews.length,
                authorAverageRating,
                authorReviews.length,
                authorOrdersCount,
                sellerOrdersCount
            )
        );

    } catch (error) {
        console.error("❌ Error fetching user profile by ID:", error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ✅ Update profile
const updateMyProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const updates = {};
        const directFieldMap = {
            full_name: 'full_name',
            phone: 'phone',
            address: 'address',
            date_of_birth: 'date_of_birth',
            bio: 'bio',
            facEbook: 'facEbook',
            facebook: 'facEbook',
            instagram: 'instagram',
            twitter: 'twitter',
            tiktok: 'tiktok',
            profile_image: 'profile_image',
        };

        Object.entries(directFieldMap).forEach(([requestField, modelField]) => {
            if (req.body[requestField] !== undefined) {
                updates[modelField] = req.body[requestField];
            }
        });

        if (req.body.whatsapp !== undefined && req.body.phone === undefined) {
            updates.phone = req.body.whatsapp;
        }

        if (req.file) {
            updates.profile_image = toUploadDbPath(req.file.path);
        }

        await User.update(updates, { where: { id: userId } });

        const updatedUser = await User.findByPk(userId, {
            attributes: { exclude: ['password'] },
            include: [
                { model: Product, as: 'products', include: [{ model: Review, attributes: ['rating'], required: false }] },
                { model: Review, as: 'reviews', attributes: ['rating'] },
                {
                    model: Ebook,
                    include: [EbookCategory, EbookSubCategory, { model: Review, attributes: ['rating'] }],
                },
            ]
        });

        const sellerReviews = await Review.findAll({
            include: [{ model: Product, where: { seller_id: updatedUser.id }, attributes: [] }],
            attributes: ['rating']
        });
        const authorReviews = await Review.findAll({
            include: [{ model: Ebook, where: { author_id: updatedUser.id }, attributes: [] }],
            attributes: ['rating']
        });
        const authorOrdersCount = await EbookOrder.count({
            include: [{ model: Ebook, where: { author_id: updatedUser.id }, attributes: [] }],
        });
        const sellerOrdersCount = await OrderItem.count({
            distinct: true,
            col: 'OrderId',
            include: [
                { model: Product, where: { seller_id: updatedUser.id }, attributes: [], required: true },
                { model: Order, where: { status: { [Op.ne]: 'cancelled' } }, attributes: [], required: true },
            ],
        });
        await attachProductOrderCounts(updatedUser.products ?? []);
        await attachEbookOrderCounts(updatedUser.Ebooks ?? []);
        const sellerAverageRating = sellerReviews.length > 0
            ? sellerReviews.reduce((acc, r) => acc + r.rating, 0) / sellerReviews.length
            : 0;
        const authorAverageRating = authorReviews.length > 0
            ? authorReviews.reduce((acc, r) => acc + r.rating, 0) / authorReviews.length
            : 0;

        return res.status(200).json({
            message: 'Profile updated',
            user: buildUserResponse(
                updatedUser,
                getBaseUrl(req),
                sellerAverageRating,
                sellerReviews.length,
                authorAverageRating,
                authorReviews.length,
                authorOrdersCount,
                sellerOrdersCount
            )
        });

    } catch (error) {
        console.error('❌ Error updating profile:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    getMyProfile,
    getUserProfile,
    updateMyProfile,
};
