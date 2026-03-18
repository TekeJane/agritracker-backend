const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const VideoCategory = sequelize.define('VideoCategory', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
});

module.exports = VideoCategory;
