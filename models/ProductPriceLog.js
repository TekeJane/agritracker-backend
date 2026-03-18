const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');




const ProductPriceLog = sequelize.define('ProductPriceLog', {
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    logged_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'product_price_logs',
    timestamps: false,
});

ProductPriceLog.associate = (models) => {
    ProductPriceLog.belongsTo(models.Product, {
        foreignKey: 'ProductId',
        as: 'Product'
    });
};


module.exports = ProductPriceLog;
