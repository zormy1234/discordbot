import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import dotenv from 'dotenv';
dotenv.config();

const poolOptions: PoolOptions = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT), 
  user: process.env.CLAN_DB_USERNAME,
  password: process.env.CLAN_DB_PASSWORD,
  database: "s190398_clan_details",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 10,
};

const connection: Pool = mysql.createPool(poolOptions);

export default connection;

// Helper types for cleaner queries
export type QueryResult<T> = [T[], any]; // rows, fields
export type DBRow = RowDataPacket;
export type DBResult = ResultSetHeader;
