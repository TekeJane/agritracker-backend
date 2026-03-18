module.exports = (sequelize, DataTypes) => {
    const BlogPost = sequelize.define('BlogPost', {
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        media_urls: {
            type: DataTypes.JSON, // can store an array of image/video URLs
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
            defaultValue: 'pending',
        },
    });

    BlogPost.associate = (models) => {
        BlogPost.belongsTo(models.User, {
            foreignKey: 'UserId',
            as: 'author',
        });

        BlogPost.belongsTo(models.BlogCategory, {
            foreignKey: 'BlogCategoryId',
            as: 'category',
        });
    };

    return BlogPost;
};
