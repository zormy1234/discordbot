import Database from "better-sqlite3";

const connection = require('./connect.js')

// Create/open database
const db = new Database("s190398_clan_details.db");

// Ensure a setup table exists
connection.prepare(`
  CREATE TABLE IF NOT EXISTS clan_discord_details (
    guild_id TEXT PRIMARY KEY,
    mod_role_id TEXT,
    winlog_channel_id TEXT
  )
`).run();

export default db;
