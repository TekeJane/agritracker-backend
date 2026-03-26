'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Products');

    if (!table.unit) {
      await queryInterface.addColumn('Products', 'unit', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!table.minimum_order_quantity) {
      await queryInterface.addColumn('Products', 'minimum_order_quantity', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!table.variety) {
      await queryInterface.addColumn('Products', 'variety', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!table.harvest_date) {
      await queryInterface.addColumn('Products', 'harvest_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }

    if (!table.shelf_life) {
      await queryInterface.addColumn('Products', 'shelf_life', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!table.origin_region) {
      await queryInterface.addColumn('Products', 'origin_region', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!table.origin_town) {
      await queryInterface.addColumn('Products', 'origin_town', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('Products');

    if (table.origin_town) {
      await queryInterface.removeColumn('Products', 'origin_town');
    }

    if (table.origin_region) {
      await queryInterface.removeColumn('Products', 'origin_region');
    }

    if (table.shelf_life) {
      await queryInterface.removeColumn('Products', 'shelf_life');
    }

    if (table.harvest_date) {
      await queryInterface.removeColumn('Products', 'harvest_date');
    }

    if (table.variety) {
      await queryInterface.removeColumn('Products', 'variety');
    }

    if (table.minimum_order_quantity) {
      await queryInterface.removeColumn('Products', 'minimum_order_quantity');
    }

    if (table.unit) {
      await queryInterface.removeColumn('Products', 'unit');
    }
  },
};
