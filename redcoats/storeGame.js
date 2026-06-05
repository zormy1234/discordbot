import { enqueuePrivateDb } from '../database/dbQueue.js';
import { connection as db } from '../database/SharedConnect.js';
export async function storeGame(input) {
    enqueuePrivateDb('store-redcoats-game', async () => {
        for (const row of input.results) {
            const kd = row.playerKills / Math.max(row.deaths, 1);
            await db.execute(`
            INSERT INTO redcoats_game_results (
              gid,
              username,
              clan,
              rank,
              score,
              kills,
              player_kills,
              deaths,
              kd
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
                row.gid,
                row.username,
                row.clan ?? null,
                row.rank,
                row.score,
                row.kills,
                row.playerKills,
                row.deaths,
                kd,
            ]);
            await db.execute(`
            INSERT INTO redcoats_player_names (
              gid,
              username
            )
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
              last_seen = CURRENT_TIMESTAMP
          `, [
                row.gid,
                row.username,
            ]);
            await db.execute(`
            INSERT INTO redcoats_player_stats (
              gid,
              latest_username,
              latest_clan,

              total_games,

              total_score,
              total_kills,
              total_player_kills,
              total_deaths,

              highest_score,
              best_single_game_kd,
              average_kd,

              last_seen
            )
            VALUES (
              ?, ?, ?,
              1,
              ?, ?, ?, ?,
              ?, ?, ?,
              NOW()
            )
            ON DUPLICATE KEY UPDATE

              latest_username = VALUES(latest_username),
              latest_clan = VALUES(latest_clan),

              total_games = total_games + 1,

              total_score = total_score + VALUES(total_score),

              total_kills = total_kills + VALUES(total_kills),

              total_player_kills =
                total_player_kills + VALUES(total_player_kills),

              total_deaths =
                total_deaths + VALUES(total_deaths),

              highest_score = GREATEST(
                highest_score,
                VALUES(highest_score)
              ),

              best_single_game_kd = GREATEST(
                best_single_game_kd,
                VALUES(best_single_game_kd)
              ),

              average_kd =
                (
                  (total_player_kills + VALUES(total_player_kills))
                  /
                  GREATEST(
                    total_deaths + VALUES(total_deaths),
                    1
                  )
                ),

              last_seen = CURRENT_TIMESTAMP
          `, [
                row.gid,
                row.username,
                row.clan ?? null,
                row.score,
                row.kills,
                row.playerKills,
                row.deaths,
                row.score,
                kd,
                kd,
            ]);
            await db.execute(`
            INSERT INTO redcoats_daily_stats (
              gid,
              stat_date,
              total_player_kills,
              total_kills,
              average_kd,
              games_played
            )
            VALUES (
              ?,
              CURRENT_DATE,
              ?,
              ?,
              ?,
              1
            )
             ON DUPLICATE KEY UPDATE
              total_player_kills = total_player_kills + VALUES(total_player_kills),
              total_kills = total_kills + VALUES(total_kills),
              games_played = games_played + 1,
              average_kd = (average_kd + VALUES(average_kd)) / 2
          `, [
                row.gid,
                row.playerKills,
                row.kills,
                kd,
            ]);
        }
    });
}
