const { Sequelize } = require('sequelize');
require('dotenv').config();

// Prefer explicit env vars, then Railway defaults, then URL-style configs
const connectionUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || null;

let DB_NAME = process.env.DB_NAME || process.env.MYSQLDATABASE;
let DB_USER = process.env.DB_USER || process.env.MYSQLUSER || 'root';
let DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '';
let DB_HOST = process.env.DB_HOST || process.env.MYSQLHOST;
let DB_PORT = process.env.DB_PORT || process.env.MYSQLPORT || 3306;
let DB_DIALECT = process.env.DB_DIALECT || 'mysql';

// If a single URL is provided (common in managed hosts), parse it
if (connectionUrl) {
    try {
        const url = new URL(connectionUrl);
        DB_DIALECT = url.protocol.replace(':', '') || DB_DIALECT;
        DB_HOST = url.hostname || DB_HOST;
        DB_PORT = url.port || DB_PORT;
        DB_NAME = url.pathname ? url.pathname.slice(1) : DB_NAME;
        DB_USER = url.username || DB_USER;
        DB_PASSWORD = url.password || DB_PASSWORD;
    } catch (err) {
        console.warn('Warning: failed to parse DATABASE_URL / MYSQL_URL. Falling back to individual env vars.', err.message);
    }
}

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: DB_DIALECT,
    logging: false,
});

module.exports = sequelize;
