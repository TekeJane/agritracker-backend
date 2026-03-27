const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const EbookSubCategory = sequelize.define('EbookSubCategory', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
    },
    category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
});

module.exports = EbookSubCategory;
