import {
    PermissionFlagsBits,
    SlashCommandBuilder,
    ChatInputCommandInteraction,
  } from "discord.js";
  import connection from '../database/connect.js';
  import { parseShipsLine } from "../handle_winlogs/ReceiveWinlogs.js"; // same structure as parseLine
  import dayjs from "dayjs";
  
  export const data = new SlashCommandBuilder()
    .setName("backfill_ships")
    .setDescription("Rebuild ships history and totals from Discord winlogs")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("after")
        .setDescription("Only fetch messages after this message ID")
        .setRequired(false)
    );
  
  export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: false });
  
    try {
      const channel = interaction.channel;
      if (!channel?.isTextBased()) {
        return interaction.editReply("❌ Run this in a text-based channel.");
      }
  
      const afterMessageId = interaction.options.getString("after") ?? undefined;
      const seen = new Set<string>();
      let insertedHistory = 0;
  
      console.log("📥 Starting ships backfill...");
      let lastId = afterMessageId;
  
      while (true) {
        const messages = await channel.messages.fetch({ limit: 100, after: lastId });
        if (!messages.size) break;
  
        const batch = Array.from(messages.values()).sort(
          (a, b) => a.createdTimestamp - b.createdTimestamp
        );
  
        for (const msg of batch) {
          if (!msg.content?.trim() || seen.has(msg.id)) continue;
          seen.add(msg.id);
  
          const parsedLines = msg.content
            .replace(/```/g, "")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map(parseShipsLine)
            .filter((p) => p != null);
  
          if (!parsedLines.length) continue;
  
          for (const row of parsedLines) {
            const { gid, username, clan, rank, kills, deaths } = row!;
            const created_at = msg.createdAt;
  
            // 1️⃣ Insert into ships_history
            await connection.execute(
              `INSERT INTO ships_history
                (gid, username, clan_tag, rank, kills, deaths, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [gid, username, clan ?? null, rank, kills, deaths, created_at]
            );
  
            insertedHistory++;
  
            // 2️⃣ Upsert into ships_totals
            const kd = deaths > 0 ? kills / deaths : kills;
            const createdAt = msg.createdAt ? new Date(msg.createdAt) : new Date();
  
            await connection.execute(
              `INSERT INTO ships_totals (
                  gid, total_kills, total_deaths, avg_kd, num_entries,
                  highest_kd, highest_kd_date, highest_kd_kills, highest_kd_deaths,
                  highest_kills, highest_kills_date, highest_kills_deaths,
                  highest_deaths, highest_deaths_date, highest_deaths_kills,
                  all_names, recent_name, recent_clan_tag, last_entry
                )
                VALUES (?, ?, ?, ?, 1,
                        ?, ?, ?, ?,
                        ?, ?, ?,
                        ?, ?, ?,
                        JSON_ARRAY(?), ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  total_kills = total_kills + VALUES(total_kills),
                  total_deaths = total_deaths + VALUES(total_deaths),
                  num_entries = num_entries + 1,
                    avg_kd = CASE
                                WHEN (VALUES(total_kills) = 0 AND VALUES(total_deaths) = 0)
                                THEN avg_kd
                                ELSE ((avg_kd * (num_entries - 1)) + VALUES(avg_kd)) / num_entries
                            END,
                  highest_kd = GREATEST(highest_kd, VALUES(highest_kd)),
                  highest_kd_date = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(last_entry) ELSE highest_kd_date END,
                  highest_kd_kills = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(highest_kd_kills) ELSE highest_kd_kills END,
                  highest_kd_deaths = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(highest_kd_deaths) ELSE highest_kd_deaths END,
                  highest_kills = GREATEST(highest_kills, VALUES(highest_kills)),
                  highest_kills_date = CASE WHEN VALUES(highest_kills) > highest_kills THEN VALUES(last_entry) ELSE highest_kills_date END,
                  highest_deaths = GREATEST(highest_deaths, VALUES(highest_deaths)),
                  highest_deaths_date = CASE WHEN VALUES(highest_deaths) > highest_deaths THEN VALUES(last_entry) ELSE highest_deaths_date END,
                  all_names = IF(
                    JSON_CONTAINS(all_names, JSON_QUOTE(VALUES(recent_name))),
                    all_names,
                    JSON_ARRAY_APPEND(all_names, '$', VALUES(recent_name))
                  ),
                  recent_name = VALUES(recent_name),
                  recent_clan_tag = VALUES(recent_clan_tag),
                  last_entry = VALUES(last_entry);`,
              [
                gid,                 // gid
                kills,               // total_kills
                deaths,              // total_deaths
                kd,                  // avg_kd
                // num_entries = 1 hardcoded
                kd,                  // highest_kd
                createdAt,           // highest_kd_date
                kills,               // highest_kd_kills
                deaths,              // highest_kd_deaths
                kills,               // highest_kills
                createdAt,           // highest_kills_date
                deaths,              // highest_kills_deaths
                deaths,              // highest_deaths
                createdAt,           // highest_deaths_date
                kills,               // highest_deaths_kills
                username,            // all_names (JSON_ARRAY(?))
                username,            // recent_name
                clan ?? null,        // recent_clan_tag
                createdAt,           // last_entry
              ]
            );
  
            // 3️⃣ Upsert into ships_daily_totals
            const day = dayjs(created_at).format("YYYY-MM-DD");
  
            await connection.execute(
              `INSERT INTO ships_daily_totals (
                  gid, day, total_kills, total_deaths, avg_kd, num_entries,
                  highest_kd, highest_kills, highest_deaths,
                  recent_name, recent_clan_tag, last_entry
                )
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  total_kills = total_kills + VALUES(total_kills),
                  total_deaths = total_deaths + VALUES(total_deaths),
                  num_entries = num_entries + 1,
                  avg_kd = ((avg_kd * (num_entries - 1)) + VALUES(avg_kd)) / num_entries,
                  highest_kd = GREATEST(highest_kd, VALUES(highest_kd)),
                  highest_kills = GREATEST(highest_kills, VALUES(highest_kills)),
                  highest_deaths = GREATEST(highest_deaths, VALUES(highest_deaths)),
                  recent_name = VALUES(recent_name),
                  recent_clan_tag = VALUES(recent_clan_tag),
                  last_entry = VALUES(last_entry);`,
              [
                gid,
                day,
                kills,
                deaths,
                kd,
                kd,
                kills,
                deaths,
                username,
                clan ?? null,
                created_at,
              ]
            );
          }
        }
  
        lastId = batch[batch.length - 1]?.id;
        console.log(`✅ Processed ${seen.size} messages so far...`);
      }
  
      await interaction.editReply(
        `✅ Finished backfill — inserted ${insertedHistory} history rows.`
      );
    } catch (err) {
      console.error("Backfill ships error:", err);
      return interaction.editReply("❌ Failed during backfill.");
    }
  }
  