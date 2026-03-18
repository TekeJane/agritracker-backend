'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('Posts');

    if (!table.category) {
      await queryInterface.addColumn('Posts', 'category', {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'general',
      });
    }

    if (!table.dislikes_count) {
      await queryInterface.addColumn('Posts', 'dislikes_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!table.shares_count) {
      await queryInterface.addColumn('Posts', 'shares_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Posts', 'category');
    await queryInterface.removeColumn('Posts', 'dislikes_count');
    await queryInterface.removeColumn('Posts', 'shares_count');
  },
};
