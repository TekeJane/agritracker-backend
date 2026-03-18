const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UserFollow = sequelize.define(
  'UserFollow',
  {
    follower_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    following_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'user_follows',
    timestamps: true,
  },
);

module.exports = UserFollow;
