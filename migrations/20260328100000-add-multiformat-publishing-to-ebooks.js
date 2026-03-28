'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Ebooks');

    if (!table.book_metadata) {
      await queryInterface.addColumn('Ebooks', 'book_metadata', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!table.format_variants) {
      await queryInterface.addColumn('Ebooks', 'format_variants', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!table.validation_report) {
      await queryInterface.addColumn('Ebooks', 'validation_report', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!table.publication_status) {
      await queryInterface.addColumn('Ebooks', 'publication_status', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'published',
      });
    }

    if (!table.last_draft_saved_at) {
      await queryInterface.addColumn('Ebooks', 'last_draft_saved_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('Ebooks');

    if (table.last_draft_saved_at) {
      await queryInterface.removeColumn('Ebooks', 'last_draft_saved_at');
    }

    if (table.publication_status) {
      await queryInterface.removeColumn('Ebooks', 'publication_status');
    }

    if (table.validation_report) {
      await queryInterface.removeColumn('Ebooks', 'validation_report');
    }

    if (table.format_variants) {
      await queryInterface.removeColumn('Ebooks', 'format_variants');
    }

    if (table.book_metadata) {
      await queryInterface.removeColumn('Ebooks', 'book_metadata');
    }
  },
};
