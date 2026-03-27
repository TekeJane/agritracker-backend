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
    creator_link: {
        type: DataTypes.STRING,
    },
    content_source: {
        type: DataTypes.ENUM('general', 'feature_video', 'ebook_clip'),
        allowNull: false,
        defaultValue: 'general',
    },
    is_approved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
});

// Associations
User.hasMany(VideoTip, { foreignKey: 'uploaded_by' });
VideoTip.belongsTo(User, { foreignKey: 'uploaded_by' });

VideoCategory.hasMany(VideoTip, { foreignKey: 'category_id' });
VideoTip.belongsTo(VideoCategory, { foreignKey: 'category_id' });

module.exports = VideoTip;
