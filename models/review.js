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
            allowNull: true,
        },
        ebookId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },

    });

    Review.associate = models => {
        Review.belongsTo(models.Product, { foreignKey: 'productId' });
        Review.belongsTo(models.Ebook, { foreignKey: 'ebookId' });
    };

    return Review;
};
