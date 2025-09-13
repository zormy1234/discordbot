import pool from './SharedConnect.js';
// Ensure the table exists
export async function initDB() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS tanks_win_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    gid VARCHAR(64) NOT NULL,
    clan VARCHAR(64),
    username VARCHAR(128),
    rank INT,
    score INT,
    kills INT,
    deaths INT,
    message_ts DATETIME,
    INDEX idx_gid (gid),
    INDEX idx_clan (clan),
    INDEX idx_ts (message_ts))
  `);
}
// Initialize immediately
initDB().catch(console.error);
