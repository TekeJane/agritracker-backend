'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('posts');

    if (!table.category) {
      await queryInterface.addColumn('posts', 'category', {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'general',
      });
    }

    if (!table.dislikes_count) {
      await queryInterface.addColumn('posts', 'dislikes_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!table.shares_count) {
      await queryInterface.addColumn('posts', 'shares_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('posts', 'category');
    await queryInterface.removeColumn('posts', 'dislikes_count');
    await queryInterface.removeColumn('posts', 'shares_count');
  },
};
