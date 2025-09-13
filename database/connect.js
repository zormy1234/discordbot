import mysql from "mysql2/promise";
import dotenv from 'dotenv';
dotenv.config();
const poolOptions = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.CLAN_DB_USERNAME,
    password: process.env.CLAN_DB_PASSWORD,
    database: "s190398_clan_details",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 10,
};
const connection = mysql.createPool(poolOptions);
export default connection;
