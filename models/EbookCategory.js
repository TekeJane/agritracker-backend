const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const EbookCategory = sequelize.define('EbookCategory', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

module.exports = EbookCategory;
