const express = require('express'); 
const app = express();
const cors = require('cors');
require('dotenv').config();
const path = require('path');

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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
        sequelize.sync({ force: false })
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
