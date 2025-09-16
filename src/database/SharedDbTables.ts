import pool from './connect.js';

// Ensure the table exists
export async function initDB() {
  await pool.query(`
      CREATE TABLE IF NOT EXISTS tanks_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,   -- unique row id
        gid VARCHAR(64) NOT NULL,               -- gid, not unique
        username VARCHAR(255),                  -- player’s name
        clan_tag VARCHAR(255),                  -- player’s clan
        rank INT,                               -- rank in that match
        score INT,                              -- score achieved
        kills INT,                              -- kills
        deaths INT,                             -- deaths
        created_at TIMESTAMP NOT NULL -- when entry was inserted
    );
  `);
}

// Initialize immediately
initDB().catch(console.error);
