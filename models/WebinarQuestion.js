module.exports = (sequelize, DataTypes) => {
    const WebinarQuestion = sequelize.define("WebinarQuestion", {
        question_text: { type: DataTypes.TEXT, allowNull: false },
        is_answered: { type: DataTypes.BOOLEAN, defaultValue: false },
    });

    WebinarQuestion.associate = (models) => {
        WebinarQuestion.belongsTo(models.User, {
            foreignKey: 'user_id',
        });

        WebinarQuestion.belongsTo(models.Webinar, {
            foreignKey: 'webinar_id',
        });
    };

    return WebinarQuestion;
};
