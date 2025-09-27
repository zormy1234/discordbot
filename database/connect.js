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
    connectionLimit: 10,
    multipleStatements: true,
    connectTimeout: 20000,
};
const connection = mysql.createPool(poolOptions);
export default connection;
