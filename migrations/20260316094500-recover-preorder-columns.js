module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('products');

    if (!table.is_preorder) {
      await queryInterface.addColumn('products', 'is_preorder', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!table.preorder_days) {
      await queryInterface.addColumn('products', 'preorder_days', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!table.preorder_available_date) {
      await queryInterface.addColumn('products', 'preorder_available_date', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('products', 'preorder_available_date');
    await queryInterface.removeColumn('products', 'preorder_days');
    await queryInterface.removeColumn('products', 'is_preorder');
  },
};
