module.exports = (sequelize, DataTypes) => {
    const Webinar = sequelize.define("Webinar", {
        title: { type: DataTypes.STRING, allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: false },
        scheduled_date: { type: DataTypes.DATE, allowNull: false },
        stream_url: { type: DataTypes.STRING, allowNull: false },
        chat_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
        status: {
            type: DataTypes.ENUM('scheduled', 'live', 'completed'),
            defaultValue: 'scheduled'
        },
        image: { type: DataTypes.STRING, allowNull: true }, // ✅ New field
    });

    Webinar.associate = (models) => {
        Webinar.belongsTo(models.User, {
            foreignKey: 'host_user_id',
            as: 'host',
        });

        Webinar.belongsTo(models.WebinarRequest, {
            foreignKey: 'approved_request_id',
            as: 'fromRequest',
        });
    };

    return Webinar;
};
