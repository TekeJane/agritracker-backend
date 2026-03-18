// models/OrderItem.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const OrderItem = sequelize.define('OrderItem', {
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    OrderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    ProductId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    tableName: 'order_items',
    timestamps: true,
});

module.exports = OrderItem;