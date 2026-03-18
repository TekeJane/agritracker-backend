module.exports = {
async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Ebooks');

    if (!table.format) {
      await queryInterface.addColumn('Ebooks', 'format', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'Ebook',
        after: 'price',
      });
    }

    if (!table.printing_cost) {
      await queryInterface.addColumn('Ebooks', 'printing_cost', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        after: 'format',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Ebooks', 'printing_cost');
    await queryInterface.removeColumn('Ebooks', 'format');
  },
};
