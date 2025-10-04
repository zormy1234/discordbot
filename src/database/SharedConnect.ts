// util/dbLog.js (ESM)
import mysql, {
  Pool,
  PoolOptions,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise'; // npm i mysql2
import 'dotenv/config';
import { enqueuePrivateDb, enqueueSharedDb } from '../database/dbQueue.js';

const poolOptions: PoolOptions = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.LOG_DB_USER,
  password: process.env.LOG_DB_PASS,
  database: process.env.LOG_DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  connectTimeout: 30000,
};

export const connection: Pool = mysql.createPool(poolOptions);

/**
 * evt: { ts, level, source, host, message, raw }
 */
export async function writeWinLog(evt: {
  level: any;
  source: any;
  host: any;
  message: any;
  raw: any;
}) {
  const sql = `INSERT INTO win_logs (ts, level, source, host, message, raw_json)
             VALUES (NOW(3), ?, ?, ?, ?, ?)`;
  const raw =
    typeof evt.raw === 'string' ? evt.raw : JSON.stringify(evt.raw ?? {});
  await enqueueSharedDb(() =>
    connection.execute(sql, [
      evt.level ?? null,
      evt.source ?? null,
      evt.host ?? null,
      evt.message ?? null,
      raw,
    ])
  );
}
