const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');




const ProductPriceLog = sequelize.define('ProductPriceLog', {
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    crop_name: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    unit: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'kg',
    },
    normalized_unit: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'kg',
    },
    normalized_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
    },
    market_region: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    market_name: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    source_type: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'seller',
    },
    source_confidence: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 0.7,
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
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
        foreignKey: 'product_id',
        as: 'Product'
    });
};


module.exports = ProductPriceLog;
