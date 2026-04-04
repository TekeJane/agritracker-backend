const express = require('express'); 
const app = express();
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const Sequelize = require('sequelize');
const { primaryUploadDir, legacyUploadDir } = require('./config/uploadPaths');

const sequelize = require('./config/db');

// Routes
const authRoutes = require('./routes/auth');
const myProfileRoutes = require('./routes/myProfileRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const subCategoryRoutes = require('./routes/subCategoryRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const userRoutes = require('./routes/userRoutes');
const forumRoutes = require('./routes/postRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminProductRoutes = require('./routes/adminProductRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const adminForumRoutes = require('./routes/adminForumRoutes');
const userProductRoutes = require('./routes/userProductRoutes');
const orderRoutes = require('./routes/orderRoutes');
const ebookRoutes = require('./routes/ebookRoutes');
const videoRoutes = require('./routes/videoRoutes');
const webinarRoutes = require('./routes/webinarRoutes');
const advisoryRoutes = require('./routes/advisory');
const chatbotRoutes = require('./routes/chatbot');
const notificationRoutes = require('./routes/notifications');
const marketRoutes = require('./routes/market');
const feedbackRoutes = require('./routes/feedback');
const PostRoutes = require('./routes/postRoutes');   // ✅ new Post routes (fixed filename casing)
const diseaseRoutes = require('./routes/diseaseRoutes');   // ✅ plant disease detection
     // ✅ new plant routes

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(primaryUploadDir));
if (legacyUploadDir !== primaryUploadDir) {
    app.use('/uploads', express.static(legacyUploadDir));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/myprofile', myProfileRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/subcategories', subCategoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api', reviewRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/admin/products', adminProductRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/forum', adminForumRoutes);
app.use('/api', userProductRoutes);
app.use('/api/Ebooks', ebookRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/webinars', webinarRoutes);
app.use('/api', advisoryRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/notifications', notificationRoutes);
app.use('/api/market', marketRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/Feedback', feedbackRoutes);
app.use('/api', PostRoutes);   // ✅ mount the new PostController routes
app.use('/api', diseaseRoutes); // ✅ plant disease detection
 // ✅ mount the new Plant routes

const ensureEbookSubCategorySchema = async () => {
    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    const normalizedTables = tables.map((table) =>
        typeof table === 'string' ? table : table.tableName
    );

    if (!normalizedTables.includes('EbookSubCategories')) {
        await queryInterface.createTable('EbookSubCategories', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            description: {
                type: Sequelize.TEXT,
            },
            category_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'EbookCategories',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
        });
        console.log('🟢 EbookSubCategories table ensured');
    }

    const ebookTable = await queryInterface.describeTable('Ebooks');
    if (!ebookTable.sub_category_id) {
        await queryInterface.addColumn('Ebooks', 'sub_category_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'EbookSubCategories',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
        });
        console.log('🟢 Ebooks.sub_category_id column ensured');
    }

    if (!ebookTable.is_featured) {
        await queryInterface.addColumn('Ebooks', 'is_featured', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        console.log('ðŸŸ¢ Ebooks.is_featured column ensured');
    }

    if (!ebookTable.gallery_images) {
        await queryInterface.addColumn('Ebooks', 'gallery_images', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        console.log('ðŸŸ¢ Ebooks.gallery_images column ensured');
    }

    if (!ebookTable.origin_region) {
        await queryInterface.addColumn('Ebooks', 'origin_region', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        console.log('ðŸŸ¢ Ebooks.origin_region column ensured');
    }

    if (!ebookTable.origin_town) {
        await queryInterface.addColumn('Ebooks', 'origin_town', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        console.log('ðŸŸ¢ Ebooks.origin_town column ensured');
    }

    if (!ebookTable.keywords) {
        await queryInterface.addColumn('Ebooks', 'keywords', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        console.log('Ebooks.keywords column ensured');
    }

    if (!ebookTable.posted_at) {
        await queryInterface.addColumn('Ebooks', 'posted_at', {
            type: Sequelize.DATE,
            allowNull: true,
        });
        console.log('ðŸŸ¢ Ebooks.posted_at column ensured');
    }

    if (!ebookTable.is_preorder) {
        await queryInterface.addColumn('Ebooks', 'is_preorder', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        console.log('ðŸŸ¢ Ebooks.is_preorder column ensured');
    }

    if (!ebookTable.preorder_days) {
        await queryInterface.addColumn('Ebooks', 'preorder_days', {
            type: Sequelize.INTEGER,
            allowNull: true,
        });
        console.log('ðŸŸ¢ Ebooks.preorder_days column ensured');
    }

    if (!ebookTable.book_metadata) {
        await queryInterface.addColumn('Ebooks', 'book_metadata', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        console.log('Ebooks.book_metadata column ensured');
    }

    if (!ebookTable.format_variants) {
        await queryInterface.addColumn('Ebooks', 'format_variants', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        console.log('Ebooks.format_variants column ensured');
    }

    if (!ebookTable.validation_report) {
        await queryInterface.addColumn('Ebooks', 'validation_report', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        console.log('Ebooks.validation_report column ensured');
    }

    if (!ebookTable.publication_status) {
        await queryInterface.addColumn('Ebooks', 'publication_status', {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'published',
        });
        console.log('Ebooks.publication_status column ensured');
    }

    if (!ebookTable.last_draft_saved_at) {
        await queryInterface.addColumn('Ebooks', 'last_draft_saved_at', {
            type: Sequelize.DATE,
            allowNull: true,
        });
        console.log('Ebooks.last_draft_saved_at column ensured');
    }

    const ebookOrderTable = await queryInterface.describeTable('EbookOrders');
    const ebookOrderColumns = {
        order_id: { type: Sequelize.STRING, allowNull: true },
        payment_method: { type: Sequelize.STRING, allowNull: true },
        customer_email: { type: Sequelize.STRING, allowNull: true },
        customer_phone: { type: Sequelize.STRING, allowNull: true },
        customer_address: { type: Sequelize.TEXT, allowNull: true },
        note: { type: Sequelize.TEXT, allowNull: true },
        payment_status: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'pending',
        },
        paid_at: { type: Sequelize.DATE, allowNull: true },
        transaction_id: { type: Sequelize.STRING, allowNull: true },
        delivery_method: { type: Sequelize.STRING, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
    };

    for (const [columnName, definition] of Object.entries(ebookOrderColumns)) {
        if (!ebookOrderTable[columnName]) {
            await queryInterface.addColumn('EbookOrders', columnName, definition);
            console.log(`EbookOrders.${columnName} column ensured`);
        }
    }

    const videoTable = await queryInterface.describeTable('VideoTips');
    if (!videoTable.creator_image) {
        await queryInterface.addColumn('VideoTips', 'creator_image', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        console.log('ðŸŸ¢ VideoTips.creator_image column ensured');
    }

    if (!videoTable.creator_name) {
        await queryInterface.addColumn('VideoTips', 'creator_name', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        console.log('ðŸŸ¢ VideoTips.creator_name column ensured');
    }

    if (!videoTable.creator_link) {
        await queryInterface.addColumn('VideoTips', 'creator_link', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        console.log('ðŸŸ¢ VideoTips.creator_link column ensured');
    }

    if (!videoTable.content_source) {
        await queryInterface.addColumn('VideoTips', 'content_source', {
            type: Sequelize.ENUM('general', 'feature_video', 'ebook_clip'),
            allowNull: false,
            defaultValue: 'general',
        });
        console.log('ðŸŸ¢ VideoTips.content_source column ensured');
    }

    if (!videoTable.ebook_id) {
        await queryInterface.addColumn('VideoTips', 'ebook_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'Ebooks',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
        });
        console.log('ðŸŸ¢ VideoTips.ebook_id column ensured');
    }
    if (!videoTable.is_featured) {
        await queryInterface.addColumn('VideoTips', 'is_featured', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        console.log('VideoTips.is_featured column ensured');
    }
    if (!videoTable.likes_count) {
        await queryInterface.addColumn('VideoTips', 'likes_count', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        });
        console.log('VideoTips.likes_count column ensured');
    }

    if (!videoTable.dislikes_count) {
        await queryInterface.addColumn('VideoTips', 'dislikes_count', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        });
        console.log('VideoTips.dislikes_count column ensured');
    }

    if (!videoTable.shares_count) {
        await queryInterface.addColumn('VideoTips', 'shares_count', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        });
        console.log('VideoTips.shares_count column ensured');
    }

    if (!videoTable.downloads_count) {
        await queryInterface.addColumn('VideoTips', 'downloads_count', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        });
        console.log('VideoTips.downloads_count column ensured');
    }

    const reviewTable = await queryInterface.describeTable('Reviews');
    if (!reviewTable.ebookId) {
        await queryInterface.addColumn('Reviews', 'ebookId', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'Ebooks',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
        });
        console.log('Reviews.ebookId column ensured');
    }

    if (reviewTable.productId && reviewTable.productId.allowNull === false) {
        await queryInterface.changeColumn('Reviews', 'productId', {
            type: Sequelize.INTEGER,
            allowNull: true,
        });
        console.log('Reviews.productId nullability updated');
    }

    const userTable = await queryInterface.describeTable('users');
    if (!userTable.push_tokens) {
        await queryInterface.addColumn('users', 'push_tokens', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        console.log('users.push_tokens column ensured');
    }

    if (!userTable.last_push_platform) {
        await queryInterface.addColumn('users', 'last_push_platform', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        console.log('users.last_push_platform column ensured');
    }

    const productTable = await queryInterface.describeTable('Products');
    if (!productTable.discount_price) {
        await queryInterface.addColumn('Products', 'discount_price', {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
        });
        console.log('Products.discount_price column ensured');
    }

    if (!productTable.coupon_code) {
        await queryInterface.addColumn('Products', 'coupon_code', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        console.log('Products.coupon_code column ensured');
    }

    const notificationTable = await queryInterface.describeTable('notifications');
    if (!notificationTable.metadata) {
        await queryInterface.addColumn('notifications', 'metadata', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        console.log('notifications.metadata column ensured');
    }
};

// Test database connection
const testConnection = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connection to database has been established successfully.');
        return true;
    } catch (error) {
        console.error('❌ Unable to connect to the database:', error);
        return false;
    }
};

// Test connection and start server
testConnection().then(connected => {
    if (connected) {
        // Sync database and start server
        ensureEbookSubCategorySchema()
            .then(() => sequelize.sync({ force: false }))
            .then(() => {
                console.log('🟢 Database synced');
                const PORT = process.env.PORT || 3000;
                app.listen(PORT, () => {
                    console.log(`🚀 Server running on port ${PORT}`);
                });
            })
            .catch((err) => {
                console.error('❌ Failed to sync database:', err);
            });
    } else {
        console.error('❌ Could not connect to the database. Server not started.');
    }
});
