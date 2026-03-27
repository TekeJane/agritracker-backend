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
    keywords: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
            const raw = this.getDataValue('keywords');
            if (!raw) return [];
            return String(raw)
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
        },
        set(value) {
            if (Array.isArray(value)) {
                this.setDataValue('keywords', value.map((item) => String(item).trim()).filter(Boolean).join(', '));
                return;
            }
            this.setDataValue('keywords', value || null);
        },
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
    gallery_images: {
        type: DataTypes.TEXT,
        get() {
            const raw = this.getDataValue('gallery_images');
            if (!raw) return [];
            try {
                return JSON.parse(raw);
            } catch (_) {
                return [];
            }
        },
        set(value) {
            this.setDataValue('gallery_images', JSON.stringify(value || []));
        },
    },
    origin_region: {
        type: DataTypes.STRING,
    },
    origin_town: {
        type: DataTypes.STRING,
    },
    posted_at: {
        type: DataTypes.DATE,
    },
    is_preorder: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    preorder_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
