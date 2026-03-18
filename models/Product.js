// models/Product.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Product = sequelize.define('Product', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    stock_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    images: {
        type: DataTypes.JSON, // Array of image URLs
    },
    videos: {
        type: DataTypes.JSON, // Array of video URLs
    },
    is_featured: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    is_preorder: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    preorder_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    preorder_available_date: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    CategoryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    SubCategoryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    seller_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    market_region: {
        type: DataTypes.STRING,
        allowNull: true,
    }
}, {
    tableName: 'Products',
    timestamps: true,
});

Product.associate = (models) => {
    Product.hasMany(models.ProductPriceLog, {
        foreignKey: 'ProductId',
        as: 'PriceLogs'
    });
};

module.exports = Product;

