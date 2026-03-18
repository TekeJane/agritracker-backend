const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Like = sequelize.define('Like', {
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    Post_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    comment_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    }
}, {
    tableName: 'likes',
    timestamps: true,
});

module.exports = Like;
