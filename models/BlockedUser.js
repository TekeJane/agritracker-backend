const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const BlockedUser = sequelize.define('BlockedUser', {
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    full_name: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    reason: DataTypes.STRING,
    blocked_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'blocked_users',
    timestamps: false,
});

module.exports = BlockedUser;
