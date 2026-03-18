// models/Feedback.js

module.exports = (sequelize, DataTypes) => {
    const Feedback = sequelize.define('Feedback', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
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
        tableName: 'Feedbacks',       // optional: match actual DB table
        timestamps: true              // adds createdAt, updatedAt
    });

    return Feedback;
};
