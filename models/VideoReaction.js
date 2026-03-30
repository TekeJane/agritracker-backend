const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const VideoReaction = sequelize.define(
    'VideoReaction',
    {
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        video_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        reaction_type: {
            type: DataTypes.ENUM('like', 'dislike'),
            allowNull: false,
        },
    },
    {
        tableName: 'video_reactions',
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['user_id', 'video_id'],
            },
        ],
    },
);

module.exports = VideoReaction;
