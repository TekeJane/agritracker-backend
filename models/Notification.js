// models/Notification.js
module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define("Notification", {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING,
        },
        message: {
            type: DataTypes.TEXT,
        },
        type: {
            type: DataTypes.ENUM('feature', 'order', 'sale'),
            defaultValue: 'order',
        },
        is_read: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'notifications',
        timestamps: false, // or true if you're using createdAt/updatedAt
    });

    return Notification;
};
