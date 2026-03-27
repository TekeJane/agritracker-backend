require('dotenv').config();
const sequelize = require('../config/db');

async function ensureColumn(tableName, columnName, definition) {
    const table = await sequelize.getQueryInterface().describeTable(tableName);
    if (table[columnName]) {
        console.log(`Column already exists: ${columnName}`);
        return;
    }
    await sequelize.getQueryInterface().addColumn(tableName, columnName, definition);
    console.log(`Added column: ${columnName}`);
}

async function run() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database');

        const DataTypes = require('sequelize').DataTypes;
        const tableName = 'product_price_logs';

        await ensureColumn(tableName, 'crop_name', { type: DataTypes.STRING, allowNull: true });
        await ensureColumn(tableName, 'unit', { type: DataTypes.STRING, allowNull: true, defaultValue: 'kg' });
        await ensureColumn(tableName, 'normalized_unit', { type: DataTypes.STRING, allowNull: true, defaultValue: 'kg' });
        await ensureColumn(tableName, 'normalized_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true });
        await ensureColumn(tableName, 'market_region', { type: DataTypes.STRING, allowNull: true });
        await ensureColumn(tableName, 'market_name', { type: DataTypes.STRING, allowNull: true });
        await ensureColumn(tableName, 'source_type', { type: DataTypes.STRING, allowNull: true, defaultValue: 'seller' });
        await ensureColumn(tableName, 'source_confidence', { type: DataTypes.DECIMAL(5, 2), allowNull: true, defaultValue: 0.7 });
        await ensureColumn(tableName, 'notes', { type: DataTypes.TEXT, allowNull: true });

        console.log('Market price log schema update complete');
        process.exit(0);
    } catch (error) {
        console.error('Failed to update market price log schema:', error);
        process.exit(1);
    }
}

run();
