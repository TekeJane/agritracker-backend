const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
    full_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
    },
    phone: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    address: {
        type: DataTypes.STRING,
    },
    date_of_birth: {
        type: DataTypes.DATEONLY,
    },
    profile_image: {
        type: DataTypes.STRING,
    },
    account_type: {
        type: DataTypes.ENUM('buyer', 'seller', 'author'),
        allowNull: false,
        defaultValue: 'buyer',
    },

    bio: {
        type: DataTypes.TEXT,
    },
    facebook: {
        type: DataTypes.STRING,
    },
    instagram: {
        type: DataTypes.STRING,
    },
    twitter: {
        type: DataTypes.STRING,
    },
    tiktok: {
        type: DataTypes.STRING,
    },
    role: {
        type: DataTypes.ENUM('user', 'admin'),
        allowNull: false,
        defaultValue: 'user',
    },

}, {
    tableName: 'users',
    timestamps: true,
});

User.associate = (models) => {
    User.hasMany(models.Product, { foreignKey: 'seller_id', as: 'products' });
    User.hasMany(models.Order);
    User.hasMany(models.Cart);
    User.hasMany(models.Review, { foreignKey: 'user_id', as: 'reviews' });
    User.hasMany(models.ForumMessage, { foreignKey: 'user_id' });
    User.hasMany(models.BlogPost, { foreignKey: 'UserId', as: 'blogPosts' });
};

module.exports = User;
