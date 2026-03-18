// models/Feedback.js

module.exports = (sequelize, DataTypes) => {
    const Feedback = sequelize.define('Feedback', {
        type: {
            type: DataTypes.STRING,
            allowNull: false
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        rating: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        contact_info: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        tableName: 'feedbacks',
        timestamps: true
    });

    return Feedback;
};
