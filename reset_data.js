const db = require('./models');

(async () => {
  const {
    sequelize, User, Category, SubCategory, Product, Order, OrderItem, Cart,
    Review, EbookCategory, EbookSubCategory, Ebook, EbookOrder, VideoCategory,
    VideoTip, WebinarRequest, Webinar, WebinarAttendee, WebinarQuestion,
    Notification, Feedback, Post, Comment, Like, ProductPriceLog, UserFollow,
  } = db;

  const models = [
    ProductPriceLog,
    Like,
    Comment,
    Post,
    Notification,
    Feedback,
    UserFollow,
    WebinarQuestion,
    WebinarAttendee,
    Webinar,
    WebinarRequest,
    VideoTip,
    VideoCategory,
    Review,
    Cart,
    OrderItem,
    Order,
    Product,
    EbookOrder,
    Ebook,
    EbookSubCategory,
    EbookCategory,
    SubCategory,
    Category,
  ];

  try {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const model of models) {
      await model.destroy({ where: {}, force: true });
      console.log(`Cleared ${model.name}`);
    }
    await User.destroy({ where: { role: 'user' }, force: true });
    console.log('Cleared all non-admin users');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    await sequelize.close();
  }
})();
