// models/review.js
module.exports = (sequelize, DataTypes) => {
    const Review = sequelize.define('Review', {
        rating: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: { min: 1, max: 5 }
        },
        comment: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },

    });

    Review.associate = models => {
        Review.belongsTo(models.Product, { foreignKey: 'productId' });
    };

    return Review;
};
