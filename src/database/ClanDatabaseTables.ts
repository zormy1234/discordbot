import pool from './connect.js';

// Ensure the table exists
export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clan_discord_details (
      guild_id VARCHAR(255) PRIMARY KEY,
      mod_role_id VARCHAR(255),
      tanks_clan_tag VARCHAR(255),
      tanks_winlog_channel_id VARCHAR(255)
    )
  `);
}

// Initialize immediately
initDB().catch(console.error);
