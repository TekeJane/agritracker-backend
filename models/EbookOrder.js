const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./user');
const Ebook = require('./Ebook');

const EbookOrder = sequelize.define('EbookOrder', {
    order_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    price_paid: {
        type: DataTypes.DECIMAL,
        allowNull: false
    },
    payment_method: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customer_email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customer_phone: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customer_address: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    note: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    payment_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending'
    },
    paid_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    transaction_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    delivery_method: {
        type: DataTypes.STRING,
        allowNull: true
    },
    purchased_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    }
});

// Associations
User.hasMany(EbookOrder, { foreignKey: 'user_id' });
EbookOrder.belongsTo(User, { foreignKey: 'user_id' });

Ebook.hasMany(EbookOrder, { foreignKey: 'Ebook_id' });
EbookOrder.belongsTo(Ebook, { foreignKey: 'Ebook_id' });

module.exports = EbookOrder;
