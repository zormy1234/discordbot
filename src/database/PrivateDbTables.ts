import pool from './connect.js';

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
      last_entry TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      gid VARCHAR(64) NOT NULL,
      username VARCHAR(255),
      clan_tag VARCHAR(255),
      rank INT,
      kills INT,
      deaths INT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ships_totals (
      gid VARCHAR(64) PRIMARY KEY,
      total_kills INT DEFAULT 0,
      total_deaths INT DEFAULT 0,
      avg_kd FLOAT DEFAULT 0,
      full_avg_kd FLOAT DEFAULT 0,
      num_entries INT DEFAULT 0,
      highest_kd FLOAT DEFAULT 0,
      highest_kd_date TIMESTAMP NULL DEFAULT NULL,
      highest_kd_kills INT DEFAULT 0,
      highest_kd_deaths INT DEFAULT 0,
      highest_kills INT DEFAULT 0,
      highest_kills_date TIMESTAMP NULL DEFAULT NULL,
      highest_kills_deaths INT DEFAULT 0,
      highest_deaths INT DEFAULT 0,
      highest_deaths_date TIMESTAMP NULL DEFAULT NULL,
      highest_deaths_kills INT DEFAULT 0,
      all_names JSON DEFAULT (JSON_ARRAY()),
      recent_name VARCHAR(255),
      recent_clan_tag VARCHAR(255),
      last_entry TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ships_daily_totals (
      gid VARCHAR(64) NOT NULL,
      day DATE NOT NULL,
      total_kills INT DEFAULT 0,
      total_deaths INT DEFAULT 0,
      avg_kd FLOAT DEFAULT 0,
      full_avg_kd FLOAT DEFAULT 0,
      num_entries INT DEFAULT 0,
      highest_kd FLOAT DEFAULT 0,
      highest_kills INT DEFAULT 0,
      highest_deaths INT DEFAULT 0,
      recent_name VARCHAR(255),
      recent_clan_tag VARCHAR(255),
      last_entry TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (gid, day)
    );

    CREATE TABLE IF NOT EXISTS bounties (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      target_gid VARCHAR(32) NULL,
      target_name VARCHAR(100) NOT NULL,
      placed_by_discord_id VARCHAR(32) NOT NULL,
      reward INT NOT NULL,
      status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
      completed_by_discord_id VARCHAR(32) NULL,
      completed_by_name VARCHAR(64) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      reason VARCHAR(255) DEFAULT 'No reason given',
      image_url VARCHAR(255) NULL,
      completed_image_url VARCHAR(500) NULL
    );

    CREATE TABLE IF NOT EXISTS gold_balances (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      gold INT DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS bounty_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bounty_id INT NOT NULL,
      action VARCHAR(50),
      actor_discord_id BIGINT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bounty_config (
      guild_id VARCHAR(32) PRIMARY KEY,
      bounty_role_id VARCHAR(32) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trader2_players (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      playerCount INT NOT NULL,
      INDEX idx_trader2_timestamp (timestamp)
    );

    CREATE TABLE IF NOT EXISTS redcoats_game_results (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,

      gid VARCHAR(64) NOT NULL,
      username VARCHAR(255) NOT NULL,
      clan VARCHAR(255),

      rank INT NOT NULL,
      score INT NOT NULL,
      kills INT NOT NULL,
      player_kills INT NOT NULL,
      deaths INT NOT NULL,

      kd DECIMAL(10,4) NOT NULL,

      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redcoats_player_names (
      gid VARCHAR(64) NOT NULL,
      username VARCHAR(255) NOT NULL,

      first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (gid, username)
    );

    CREATE TABLE IF NOT EXISTS redcoats_player_stats (
      gid VARCHAR(64) PRIMARY KEY,

      latest_username VARCHAR(255) NOT NULL,
      latest_clan VARCHAR(255),

      total_games INT NOT NULL DEFAULT 0,

      total_score BIGINT NOT NULL DEFAULT 0,
      total_kills BIGINT NOT NULL DEFAULT 0,
      total_player_kills BIGINT NOT NULL DEFAULT 0,
      total_deaths BIGINT NOT NULL DEFAULT 0,

      highest_score INT NOT NULL DEFAULT 0,

      best_single_game_kd DECIMAL(10,4)
        NOT NULL DEFAULT 0,

      average_kd DECIMAL(10,4)
        NOT NULL DEFAULT 0,

      last_seen TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redcoats_daily_stats (
      gid VARCHAR(64) NOT NULL,

      stat_date DATE NOT NULL,

      total_player_kills INT NOT NULL DEFAULT 0,
      total_kills INT NOT NULL DEFAULT 0,

      average_kd DECIMAL(10,4)
        NOT NULL DEFAULT 0,

      games_played INT NOT NULL DEFAULT 0,

      PRIMARY KEY (gid, stat_date)
    );

    CREATE TABLE IF NOT EXISTS redcoats_discord_links (
      discord_user_id VARCHAR(64) PRIMARY KEY,

      gid VARCHAR(64) NOT NULL,

      linked_by VARCHAR(64) NOT NULL,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redcoats_role_rules (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,

      guild_id VARCHAR(64) NOT NULL,

      discord_role_id VARCHAR(64) NOT NULL,

      stat_type VARCHAR(64) NOT NULL,

      threshold DECIMAL(10,4) NOT NULL,

      created_by VARCHAR(64) NOT NULL,

      created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

initDB().catch(console.error);