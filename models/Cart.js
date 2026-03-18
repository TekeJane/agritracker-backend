// models/Cart.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Cart = sequelize.define('Cart', {
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: {
            min: 1
        }
    },
    UserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    ProductId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    tableName: 'carts',
    timestamps: true,
});

module.exports = Cart;