// models/Order.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

module.exports = (sequelize, DataTypes) => {
    const BlogCategory = sequelize.define('BlogCategory', {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: DataTypes.TEXT,
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    });

    BlogCategory.associate = (models) => {
        BlogCategory.hasMany(models.BlogPost, {
            foreignKey: 'BlogCategoryId',
            as: 'posts',
        });
    };

    return BlogCategory;
};
