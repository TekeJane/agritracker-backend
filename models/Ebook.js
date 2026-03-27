const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./user');
const EbookCategory = require('./EbookCategory');
const EbookSubCategory = require('./EbookSubCategory');

const Ebook = sequelize.define('Ebook', {
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
    },
    price: {
        type: DataTypes.DECIMAL,
        allowNull: false
    },
    format: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Ebook'
    },
    printing_cost: {
        type: DataTypes.DECIMAL,
        allowNull: false,
        defaultValue: 0
    },
    file_url: {
        type: DataTypes.STRING,
        allowNull: true
    },
    cover_image: {
        type: DataTypes.STRING,
    },
    is_approved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    is_featured: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
});

// Associations
User.hasMany(Ebook, { foreignKey: 'author_id' });
Ebook.belongsTo(User, { foreignKey: 'author_id' });

EbookCategory.hasMany(Ebook, { foreignKey: 'category_id' });
Ebook.belongsTo(EbookCategory, { foreignKey: 'category_id' });

EbookSubCategory.hasMany(Ebook, { foreignKey: 'sub_category_id' });
Ebook.belongsTo(EbookSubCategory, { foreignKey: 'sub_category_id' });

module.exports = Ebook;
