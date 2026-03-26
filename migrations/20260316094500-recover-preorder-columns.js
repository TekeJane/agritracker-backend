module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Products');

    if (!table.is_preorder) {
      await queryInterface.addColumn('Products', 'is_preorder', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!table.preorder_days) {
      await queryInterface.addColumn('Products', 'preorder_days', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!table.preorder_available_date) {
      await queryInterface.addColumn('Products', 'preorder_available_date', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Products', 'preorder_available_date');
    await queryInterface.removeColumn('Products', 'preorder_days');
    await queryInterface.removeColumn('Products', 'is_preorder');
  },
};
