import { Message } from 'discord.js';
import connection from '../database/connect.js';
import { writeWinLog } from '../database/SharedConnect.js';
import { RawWithParsed } from './ReceiveWinlogs.js';

export async function storeInDb(
  lines: RawWithParsed[],
  message: Message<boolean>
) {
  for (const line of lines) {
    // Always log the raw line
    try {
      await writeWinLog({
        level: 'info',
        source: 'discord:winlogs-forwarder',
        host: message.guild?.id ?? 'unknown',
        message: line.raw,
        raw: {
          messageId: message.id,
          guildId: message.guild?.id ?? null,
          channelId: message.channel.id,
          authorId: message.author.id,
          clanTag: line.parsed?.clan || null,
        },
      });
    } catch (e) {
      console.error('writeWinLog failed:', e instanceof Error ? e.message : e);
    }

    if (line.parsed == undefined) continue;
    const { rank, gid, clan, username, score, kills, deaths } = line.parsed;
    const ts = message.createdAt;

    try {
      // Totals
      await connection.execute(
        `INSERT INTO tanks_totals
            (gid, total_kills, total_deaths, total_score, total_rank, num_entries, highest_score, all_names, recent_name, recent_clan_tag)
        VALUES (?, ?, ?, ?, ?, 1, ?, JSON_ARRAY(?), ?, ?)
        ON DUPLICATE KEY UPDATE
            total_kills = total_kills + VALUES(total_kills),
            total_deaths = total_deaths + VALUES(total_deaths),
            total_score = total_score + VALUES(total_score),
            total_rank = total_rank + VALUES(total_rank),
            num_entries = num_entries + 1,
            highest_score = GREATEST(highest_score, VALUES(highest_score)),
            all_names = IF(JSON_CONTAINS(all_names, JSON_QUOTE(VALUES(recent_name))), all_names, JSON_ARRAY_APPEND(all_names, '$', VALUES(recent_name))),
            recent_name = VALUES(recent_name),
            recent_clan_tag = VALUES(recent_clan_tag);`,
        [
          gid,
          kills,
          deaths,
          score,
          rank,
          score,
          username,
          username,
          clan,
        ]
      );

      // Weekly stats
      const weekStart = new Date(ts);
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

      await connection.execute(
        `INSERT INTO tanks_weekly
       (gid, week_start, kills, deaths, score, total_rank, num_entries, avg_score, avg_rank)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         kills = kills + VALUES(kills),
         deaths = deaths + VALUES(deaths),
         score = score + VALUES(score),
         total_rank = total_rank + VALUES(total_rank),
         num_entries = num_entries + 1,
         avg_score = (score + VALUES(score)) / (num_entries + 1),
         avg_rank = (total_rank + VALUES(total_rank)) / (num_entries + 1)`,
        [gid, weekStart, kills, deaths, score, rank, score, rank]
      );
    } catch (e) {
      console.error('storelines failed:', e instanceof Error ? e.message : e);
    }
  }
}
