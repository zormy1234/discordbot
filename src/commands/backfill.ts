import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
  } from "discord.js";
  import connection from "../database/connect.js";
  import {connection as sharedConnection} from "../database/SharedConnect.js";
  import { RowDataPacket } from "mysql2/promise";
  
  export const data = new SlashCommandBuilder()
    .setName("rebuild_totals")
    .setDescription("Rebuild tanks_totals from tanks_history (expensive, careful!)");
  
  export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: false });
  
    try {
      // 1. Pull everything from tanks_history
      const [rows] = await sharedConnection.query<RowDataPacket[]>(
        `SELECT * FROM tanks_history ORDER BY gid, created_at ASC`
      );
  
      if (!rows.length) {
        return interaction.editReply("❌ No history data found.");
      }
  
      // 2. Aggregate in memory
      const totals: Record<string, any> = {};
  
      for (const row of rows) {
        const gid = row.gid;
        if (!totals[gid]) {
          totals[gid] = {
            gid,
            total_kills: 0,
            total_deaths: 0,
            total_score: 0,
            total_rank: 0,
            num_entries: 0,
            highest_score: 0,
            highest_kd: 0,
            avg_kd: 0, 
            highest_kills: 0,
            highest_deaths: 0,
            number_top5: 0,
            number_top20: 0,
            all_names: new Set<string>(),
            recent_name: row.username,
            recent_clan_tag: row.clan_tag,
            last_entry: row.created_at,
          };
        }
  
        const t = totals[gid];
  
        // update totals
        t.total_kills += row.kills || 0;
        t.total_deaths += row.deaths || 0;
        t.total_score += row.score || 0;
        t.total_rank += row.rank || 0;
        t.num_entries++;
  
        // update highs
        t.highest_score = Math.max(t.highest_score, row.score || 0);
        t.highest_kills = Math.max(t.highest_kills, row.kills || 0);
        t.highest_deaths = Math.max(t.highest_deaths, row.deaths || 0);
  
        const kd = row.deaths > 0 ? row.kills / row.deaths : row.kills;
        t.highest_kd = Math.max(t.highest_kd, kd);

        t.avg_kd = t.total_deaths > 0 ? t.total_kills / t.total_deaths : t.total_kills;
  
        // update finishes
        if (row.rank <= 5) t.number_top5++;
        if (row.rank <= 20) t.number_top20++;
  
        // names
        if (row.username) t.all_names.add(row.username);
  
        // recent values
        if (row.created_at > t.last_entry) {
          t.recent_name = row.username;
          t.recent_clan_tag = row.clan_tag;
          t.last_entry = row.created_at;
        }
      }
  
       // 3. Write back into tanks_totals
    let inserted = 0;
    for (const gid in totals) {
      const t = totals[gid];
      await connection.execute(
        `INSERT INTO tanks_totals
          (gid, total_kills, total_deaths, total_score, total_rank, num_entries,
           highest_score, highest_kd, avg_kd, highest_kills, highest_deaths,
           number_top5, number_top20, all_names, recent_name, recent_clan_tag, last_entry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           total_kills = VALUES(total_kills),
           total_deaths = VALUES(total_deaths),
           total_score = VALUES(total_score),
           total_rank = VALUES(total_rank),
           num_entries = VALUES(num_entries),
           highest_score = VALUES(highest_score),
           highest_kd = VALUES(highest_kd),
           avg_kd = VALUES(avg_kd),
           highest_kills = VALUES(highest_kills),
           highest_deaths = VALUES(highest_deaths),
           number_top5 = VALUES(number_top5),
           number_top20 = VALUES(number_top20),
           all_names = VALUES(all_names),
           recent_name = VALUES(recent_name),
           recent_clan_tag = VALUES(recent_clan_tag),
           last_entry = VALUES(last_entry)`,
        [
          t.gid,
          t.total_kills,
          t.total_deaths,
          t.total_score,
          t.total_rank,
          t.num_entries,
          t.highest_score,
          t.highest_kd,
          t.avg_kd, 
          t.highest_kills,
          t.highest_deaths,
          t.number_top5,
          t.number_top20,
          JSON.stringify([...t.all_names]),
          t.recent_name,
          t.recent_clan_tag,
          t.last_entry,
        ]
      );
      inserted++;
    }
  
      return interaction.editReply(
        `✅ Rebuilt totals for ${inserted} players from tanks_history.`
      );
    } catch (err) {
      console.error("Rebuild totals error:", err);
      return interaction.editReply("❌ Failed to rebuild totals.");
    }
  }
  