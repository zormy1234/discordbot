import { SlashCommandBuilder } from 'discord.js';
import connection from '../database/connect.js';
export const data = new SlashCommandBuilder()
    .setName('rebuild_ships')
    .setDescription('Rebuild ships_totals and ships_daily_totals from ships_history');
export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        // Fetch all history rows ordered by creation
        const [rows] = await connection.execute(`
      SELECT gid, username, clan_tag, kills, deaths, created_at
      FROM ships_history
      ORDER BY created_at ASC
    `);
        // Aggregators
        const totals = {};
        const daily = {};
        for (const r of rows) {
            const gid = r.gid;
            const day = r.created_at.toISOString().slice(0, 10);
            const kd = r.deaths > 0 ? r.kills / r.deaths : r.kills;
            // --- Totals ---
            if (!totals[gid]) {
                totals[gid] = {
                    gid,
                    total_kills: 0,
                    total_deaths: 0,
                    num_entries: 0,
                    kd_values: [],
                    highest_kd: 0,
                    highest_kd_kills: 0,
                    highest_kd_deaths: 0,
                    highest_kd_date: r.created_at,
                    highest_kills: 0,
                    highest_kills_deaths: 0,
                    highest_kills_date: r.created_at,
                    highest_deaths: 0,
                    highest_deaths_kills: 0,
                    highest_deaths_date: r.created_at,
                    all_names: new Set(),
                    recent_name: r.username,
                    recent_clan_tag: r.clan_tag,
                    last_entry: r.created_at,
                };
            }
            const t = totals[gid];
            t.total_kills += r.kills;
            t.total_deaths += r.deaths;
            t.num_entries += 1;
            if (r.kills > 0)
                t.kd_values.push(kd);
            t.all_names.add(r.username);
            t.recent_name = r.username;
            t.recent_clan_tag = r.clan_tag;
            t.last_entry = r.created_at;
            // Only update highest KD if entry has non-zero kills or deaths
            if (r.kills + r.deaths > 0 && kd > t.highest_kd) {
                t.highest_kd = kd;
                t.highest_kd_kills = r.kills;
                t.highest_kd_deaths = r.deaths;
                t.highest_kd_date = r.created_at;
            }
            if (r.kills > t.highest_kills) {
                t.highest_kills = r.kills;
                t.highest_kills_deaths = r.deaths;
                t.highest_kills_date = r.created_at;
            }
            if (r.deaths > t.highest_deaths) {
                t.highest_deaths = r.deaths;
                t.highest_deaths_kills = r.kills;
                t.highest_deaths_date = r.created_at;
            }
            // --- Daily ---
            const key = `${gid}_${day}`;
            if (!daily[key]) {
                daily[key] = {
                    gid,
                    day,
                    total_kills: 0,
                    total_deaths: 0,
                    num_entries: 0,
                    kd_values: [],
                    highest_kd: 0,
                    highest_kills: 0,
                    highest_deaths: 0,
                    recent_name: r.username,
                    recent_clan_tag: r.clan_tag,
                    last_entry: r.created_at,
                };
            }
            const d = daily[key];
            d.total_kills += r.kills;
            d.total_deaths += r.deaths;
            d.num_entries += 1;
            if (r.kills > 0)
                d.kd_values.push(kd);
            d.last_entry = r.created_at;
            d.recent_name = r.username;
            d.recent_clan_tag = r.clan_tag;
            if (r.kills + r.deaths > 0 && kd > d.highest_kd)
                d.highest_kd = kd;
            if (r.kills > d.highest_kills)
                d.highest_kills = r.kills;
            if (r.deaths > d.highest_deaths)
                d.highest_deaths = r.deaths;
        }
        // --- Insert totals with ON DUPLICATE KEY UPDATE ---
        for (const gid of Object.keys(totals)) {
            const t = totals[gid];
            const avg_kd = t.kd_values.length > 0 ? t.kd_values.reduce((a, b) => a + b, 0) / t.kd_values.length : 0;
            const full_avg_kd = t.total_deaths === 0 ? t.total_kills : t.total_kills / t.total_deaths;
            await connection.execute(`INSERT INTO ships_totals
        (gid, total_kills, total_deaths, avg_kd, full_avg_kd, num_entries,
         highest_kd, highest_kd_date, highest_kd_kills, highest_kd_deaths,
         highest_kills, highest_kills_date, highest_kills_deaths,
         highest_deaths, highest_deaths_date, highest_deaths_kills,
         all_names, recent_name, recent_clan_tag, last_entry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_kills = VALUES(total_kills),
          total_deaths = VALUES(total_deaths),
          avg_kd = VALUES(avg_kd),
          full_avg_kd = VALUES(full_avg_kd),
          num_entries = VALUES(num_entries),
          highest_kd = GREATEST(highest_kd, VALUES(highest_kd)),
          highest_kd_date = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(highest_kd_date) ELSE highest_kd_date END,
          highest_kd_kills = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(highest_kd_kills) ELSE highest_kd_kills END,
          highest_kd_deaths = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(highest_kd_deaths) ELSE highest_kd_deaths END,
          highest_kills = GREATEST(highest_kills, VALUES(highest_kills)),
          highest_kills_date = CASE WHEN VALUES(highest_kills) > highest_kills THEN VALUES(highest_kills_date) ELSE highest_kills_date END,
          highest_kills_deaths = CASE WHEN VALUES(highest_kills) > highest_kills THEN VALUES(highest_kills_deaths) ELSE highest_kills_deaths END,
          highest_deaths = GREATEST(highest_deaths, VALUES(highest_deaths)),
          highest_deaths_date = CASE WHEN VALUES(highest_deaths) > highest_deaths THEN VALUES(highest_deaths_date) ELSE highest_deaths_date END,
          highest_deaths_kills = CASE WHEN VALUES(highest_deaths) > highest_deaths THEN VALUES(highest_deaths_kills) ELSE highest_deaths_kills END,
          all_names = JSON_ARRAY_APPEND(all_names, '$', JSON_QUOTE(VALUES(recent_name))),
          recent_name = VALUES(recent_name),
          recent_clan_tag = VALUES(recent_clan_tag),
          last_entry = VALUES(last_entry);`, [
                gid,
                t.total_kills,
                t.total_deaths,
                avg_kd,
                full_avg_kd,
                t.num_entries,
                t.highest_kd,
                t.highest_kd_date,
                t.highest_kd_kills,
                t.highest_kd_deaths,
                t.highest_kills,
                t.highest_kills_date,
                t.highest_kills_deaths,
                t.highest_deaths,
                t.highest_deaths_date,
                t.highest_deaths_kills,
                JSON.stringify([...t.all_names]),
                t.recent_name,
                t.recent_clan_tag,
                t.last_entry,
            ]);
        }
        // --- Insert daily totals ---
        for (const key of Object.keys(daily)) {
            const d = daily[key];
            const avg_kd = d.kd_values.length > 0 ? d.kd_values.reduce((a, b) => a + b, 0) / d.kd_values.length : 0;
            const full_avg_kd = d.total_deaths === 0 ? d.total_kills : d.total_kills / d.total_deaths;
            await connection.execute(`INSERT INTO ships_daily_totals
        (gid, day, total_kills, total_deaths, avg_kd, full_avg_kd, num_entries,
         highest_kd, highest_kills, highest_deaths,
         recent_name, recent_clan_tag, last_entry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_kills = VALUES(total_kills),
          total_deaths = VALUES(total_deaths),
          avg_kd = VALUES(avg_kd),
          full_avg_kd = VALUES(full_avg_kd),
          num_entries = VALUES(num_entries),
          highest_kd = GREATEST(highest_kd, VALUES(highest_kd)),
          highest_kills = GREATEST(highest_kills, VALUES(highest_kills)),
          highest_deaths = GREATEST(highest_deaths, VALUES(highest_deaths)),
          recent_name = VALUES(recent_name),
          recent_clan_tag = VALUES(recent_clan_tag),
          last_entry = VALUES(last_entry);`, [
                d.gid,
                d.day,
                d.total_kills,
                d.total_deaths,
                avg_kd,
                full_avg_kd,
                d.num_entries,
                d.highest_kd,
                d.highest_kills,
                d.highest_deaths,
                d.recent_name,
                d.recent_clan_tag,
                d.last_entry,
            ]);
        }
        await interaction.editReply('✅ Rebuilt ships_totals and ships_daily_totals from history');
    }
    catch (err) {
        console.error(err);
        await interaction.editReply('❌ Error rebuilding totals');
    }
}
