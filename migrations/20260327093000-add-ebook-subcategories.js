module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const normalizedTables = tables.map((table) =>
      typeof table === 'string' ? table : table.tableName
    );

    if (!normalizedTables.includes('EbookSubCategories')) {
      await queryInterface.createTable('EbookSubCategories', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
        },
        category_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'EbookCategories',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE,
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE,
        },
      });
    }

    const ebookTable = await queryInterface.describeTable('Ebooks');
    if (!ebookTable.sub_category_id) {
      await queryInterface.addColumn('Ebooks', 'sub_category_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'EbookSubCategories',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface) {
    const ebookTable = await queryInterface.describeTable('Ebooks');
    if (ebookTable.sub_category_id) {
      await queryInterface.removeColumn('Ebooks', 'sub_category_id');
    }
    await queryInterface.dropTable('EbookSubCategories');
  },
};
