const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./user');
const VideoCategory = require('./VideoCategory');

const VideoTip = sequelize.define('VideoTip', {
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
    },
    video_url: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    thumbnail_url: {
        type: DataTypes.STRING,
    },
    creator_image: {
        type: DataTypes.STRING,
    },
    creator_name: {
        type: DataTypes.STRING,
    },
    creator_link: {
        type: DataTypes.STRING,
    },
    content_source: {
        type: DataTypes.ENUM('general', 'feature_video', 'ebook_clip'),
        allowNull: false,
        defaultValue: 'general',
    },
    ebook_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    is_approved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    is_featured: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    likes_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    dislikes_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    shares_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    downloads_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
});

// Associations
User.hasMany(VideoTip, { foreignKey: 'uploaded_by' });
VideoTip.belongsTo(User, { foreignKey: 'uploaded_by' });

VideoCategory.hasMany(VideoTip, { foreignKey: 'category_id' });
VideoTip.belongsTo(VideoCategory, { foreignKey: 'category_id' });

module.exports = VideoTip;
