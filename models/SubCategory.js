// models/SubCategory.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SubCategory = sequelize.define('SubCategory', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
    },
    image: {
        type: DataTypes.STRING,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    tableName: 'sub_categories',
    timestamps: true,
});


module.exports = SubCategory;