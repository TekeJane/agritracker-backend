const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./user');
const Ebook = require('./Ebook');

const EbookOrder = sequelize.define('EbookOrder', {
    price_paid: {
        type: DataTypes.DECIMAL,
        allowNull: false
    },
    purchased_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// Associations
User.hasMany(EbookOrder, { foreignKey: 'user_id' });
EbookOrder.belongsTo(User, { foreignKey: 'user_id' });

Ebook.hasMany(EbookOrder, { foreignKey: 'Ebook_id' });
EbookOrder.belongsTo(Ebook, { foreignKey: 'Ebook_id' });

module.exports = EbookOrder;
