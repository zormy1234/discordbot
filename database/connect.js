import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const connection = mysql.createPool({
  host: process.env.DB_HOST, 
  port: process.env.DB_PORT,                      
  user: process.env.CLAN_DB_USERNAME,
  password: process.env.CLAN_DB_PASSWORD, 
  database: 's190398_clan_details',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default connection;