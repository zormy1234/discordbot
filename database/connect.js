import mysql from "mysql2/promise";
import dotenv from 'dotenv';
dotenv.config();
const poolOptions = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.CLAN_DB_USERNAME,
    password: process.env.CLAN_DB_PASSWORD,
    database: process.env.CLAN_DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    multipleStatements: true,
    connectTimeout: 30000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
};
const connection = mysql.createPool(poolOptions);
connection.pool.on('error', (err) => {
    console.error('MySQL pool error:', err);
});
export default connection;
