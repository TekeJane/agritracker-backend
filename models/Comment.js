const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Comment = sequelize.define('Comment', {
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    Post_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    text: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    likes_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    }
}, {
    tableName: 'comments',
    timestamps: true,
});

module.exports = Comment;
