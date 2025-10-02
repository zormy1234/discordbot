CREATE TABLE IF NOT EXISTS weekly_kd (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gid VARCHAR(50) NOT NULL,
  player_name VARCHAR(100) NOT NULL,
  clan_tag VARCHAR(50),
  week_start DATE NOT NULL,
  kills INT NOT NULL,
  deaths INT NOT NULL,
  kd FLOAT GENERATED ALWAYS AS (kills / NULLIF(deaths,0)) STORED,
  total_score INT DEFAULT 0,
  UNIQUE KEY unique_week (gid, week_start)
);
