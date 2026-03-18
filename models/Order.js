// models/Order.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Order = sequelize.define('Order', {
    order_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    total_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled'),
        defaultValue: 'pending',
    },
    payment_status: {
        type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
        defaultValue: 'pending',
    },
    shipping_address: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    shipping_method: {
        type: DataTypes.STRING,
    },
    payment_method: {
        type: DataTypes.STRING,
    },
    notes: {
        type: DataTypes.TEXT,
    },
    UserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    tableName: 'orders',
    timestamps: true,
});

module.exports = Order;