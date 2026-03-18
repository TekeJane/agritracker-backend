// models/WebinarRequest.js
module.exports = (sequelize, DataTypes) => {
    const WebinarRequest = sequelize.define(
        'WebinarRequest',
        {
            title: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            preferred_date: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            status: {
                type: DataTypes.ENUM('pending', 'approved', 'rejected'),
                defaultValue: 'pending',
            },
            rejection_reason: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            image: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            requested_by_user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
        },
        {
            tableName: 'webinarrequests', // ✅ use your exact table name
            timestamps: true,             // ✅ enables createdAt and updatedAt auto-fill
            underscored: false,           // or true if you use snake_case in DB
        }
    );

    WebinarRequest.associate = (models) => {
        WebinarRequest.belongsTo(models.User, {
            foreignKey: 'requested_by_user_id',
            as: 'requestedBy',
        });
    };

    return WebinarRequest;
};
