import pool from './connect.js';

// Ensure the table exists
export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clan_discord_details (
      guild_id VARCHAR(255) PRIMARY KEY,
      mod_role_id VARCHAR(255),
      tanks_clan_tag VARCHAR(255),
      tanks_winlog_channel_id VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS tanks_totals (
        gid VARCHAR(64) PRIMARY KEY,
        total_kills INT DEFAULT 0,
        total_deaths INT DEFAULT 0,
        total_score INT DEFAULT 0,
        total_rank INT DEFAULT 0,
        avg_kd FLOAT DEFAULT 0,
        num_entries INT DEFAULT 0,
        highest_score FLOAT DEFAULT 0,
        highest_kd FLOAT DEFAULT 0,
        highest_kills INT DEFAULT 0,
        highest_deaths INT DEFAULT 0,
        number_top5 INT DEFAULT 0,
        number_top20 FLOAT DEFAULT 0,
        all_names JSON DEFAULT (JSON_ARRAY()),
        recent_name VARCHAR(255),
        recent_clan_tag VARCHAR(255),
        last_entry TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tanks_weekly (
        gid VARCHAR(64),
        week_start DATE,
        kills INT DEFAULT 0,
        deaths INT DEFAULT 0,
        score INT DEFAULT 0,
        total_rank INT DEFAULT 0,
        num_entries INT DEFAULT 0,
        avg_score FLOAT DEFAULT 0,
        avg_rank FLOAT DEFAULT 0,
        PRIMARY KEY (gid, week_start)
    );

    CREATE TABLE IF NOT EXISTS ships_history (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,   -- unique row id
      gid VARCHAR(64) NOT NULL,               -- gid, not unique
      username VARCHAR(255),                  -- player’s name
      clan_tag VARCHAR(255),                  -- player’s clan
      rank INT,                               -- rank in that match
      kills INT,                              -- kills
      deaths INT,                             -- deaths
      created_at TIMESTAMP NOT NULL -- when entry was inserted
    );

      CREATE TABLE IF NOT EXISTS ships_totals (
        gid VARCHAR(64) PRIMARY KEY,
        total_kills INT DEFAULT 0,
        total_deaths INT DEFAULT 0,
        avg_kd FLOAT DEFAULT 0,
        num_entries INT DEFAULT 0,
        highest_kd FLOAT DEFAULT 0,
        highest_kd_date TIMESTAMP DEFAULT 0,
        highest_kd_kills INT DEFAULT 0,
        highest_kd_deaths INT DEFAULT 0,
        highest_kills INT DEFAULT 0,
        highest_kills_date TIMESTAMP DEFAULT 0,
        highest_kills_deaths INT DEFAULT 0,
        highest_deaths INT DEFAULT 0,
        highest_deaths_date TIMESTAMP DEFAULT 0,
        highest_deaths_kills INT DEFAULT 0,
        all_names JSON DEFAULT (JSON_ARRAY()),
        recent_name VARCHAR(255),
        recent_clan_tag VARCHAR(255),
        last_entry TIMESTAMP NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS ships_daily_totals (
      gid VARCHAR(64) NOT NULL,
      day DATE NOT NULL,
      total_kills INT DEFAULT 0,
      total_deaths INT DEFAULT 0,
      avg_kd FLOAT DEFAULT 0,
      num_entries INT DEFAULT 0,
      highest_kd FLOAT DEFAULT 0,
      highest_kills INT DEFAULT 0,
      highest_deaths INT DEFAULT 0,
      recent_name VARCHAR(255),
      recent_clan_tag VARCHAR(255),
      last_entry TIMESTAMP NOT NULL,
      PRIMARY KEY (gid, day)
    );
`);
}

// Initialize immediately
initDB().catch(console.error);
