module.exports = (sequelize, DataTypes) => {
    const WebinarAttendee = sequelize.define("WebinarAttendee", {
        joined_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        left_at: { type: DataTypes.DATE, allowNull: true },
    });

    WebinarAttendee.associate = (models) => {
        WebinarAttendee.belongsTo(models.User, {
            foreignKey: 'user_id',
        });

        WebinarAttendee.belongsTo(models.Webinar, {
            foreignKey: 'webinar_id',
        });
    };

    return WebinarAttendee;
};
