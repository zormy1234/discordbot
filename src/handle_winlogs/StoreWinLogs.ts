import { Message } from 'discord.js';
import connection from '../database/connect.js';
import {
  writeWinLog,
  connection as sharedConnection,
} from '../database/SharedConnect.js';
import { RawWithParsed } from './ReceiveWinlogs.js';
import { enqueuePrivateDb, enqueueSharedDb } from '../database/dbQueue.js';

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
      console.error('writeWinLog failed:', JSON.stringify(line.parsed), e);
    }

    if (line.parsed == undefined) continue;
    const { rank, gid, clan, username, score, kills, deaths } = line.parsed;
    const ts = message.createdAt;

    try {
      await enqueueSharedDb('tanks_history insert', () =>
        sharedConnection.execute(
          `INSERT INTO tanks_history
          (gid, username, clan_tag, rank, score, kills, deaths, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            gid,
            username,
            clan ?? null, // avoid "undefined"
            rank,
            score,
            kills,
            deaths,
            ts, // mysql2 will serialize Date -> DATETIME/TIMESTAMP
          ]
        )
      );
    } catch (e) {
      console.error(
        'store tanks history failed:',
        JSON.stringify(line.parsed),
        e
      );
    }

    try {
      // Totals
      await enqueuePrivateDb('tanks_totals insert', () =>
        connection.execute(
          `INSERT INTO tanks_totals
              (gid, total_kills, total_deaths, total_score, total_rank, num_entries,
              highest_score, highest_kd, highest_kills, highest_deaths,
              number_top5, number_top20,
              avg_kd,
              all_names, recent_name, recent_clan_tag, last_entry)
          VALUES (?, ?, ?, ?, ?, 1,
                  ?, ?, ?, ?,
                  ?, ?,
                  ?, 
                  JSON_ARRAY(?), ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            total_kills = total_kills + VALUES(total_kills),
            total_deaths = total_deaths + VALUES(total_deaths),
            total_score = total_score + VALUES(total_score),
            total_rank = total_rank + VALUES(total_rank),
            num_entries = num_entries + 1,
            highest_score = GREATEST(highest_score, VALUES(highest_score)),
            highest_kd = GREATEST(highest_kd,
                                  CASE WHEN VALUES(total_deaths) > 0
                                      THEN VALUES(total_kills) / VALUES(total_deaths)
                                      ELSE VALUES(total_kills) END),
            highest_kills = GREATEST(highest_kills, VALUES(total_kills)),
            highest_deaths = GREATEST(highest_deaths, VALUES(total_deaths)),
            number_top5 = number_top5 + (CASE WHEN VALUES(total_rank) <= 5 THEN 1 ELSE 0 END),
            number_top20 = number_top20 + (CASE WHEN VALUES(total_rank) <= 20 THEN 1 ELSE 0 END),
            avg_kd = (total_kills + VALUES(total_kills)) /
                    GREATEST(1, total_deaths + VALUES(total_deaths)),
            all_names = IF(JSON_CONTAINS(all_names, JSON_QUOTE(VALUES(recent_name))),
                            all_names,
                            JSON_ARRAY_APPEND(all_names, '$', VALUES(recent_name))),
            recent_name = VALUES(recent_name),
            recent_clan_tag = VALUES(recent_clan_tag),
            last_entry = VALUES(last_entry);`,
          [
            gid,
            kills,
            deaths,
            score,
            rank,
            score, // highest_score candidate
            deaths > 0 ? kills / deaths : kills, // highest_kd candidate
            kills, // highest_kills candidate
            deaths, // highest_deaths candidate
            rank <= 5 ? 1 : 0, // number_top5 initial
            rank <= 20 ? 1 : 0, // number_top20 initial
            deaths > 0 ? kills / deaths : kills, // avg_kd initial
            username,
            username,
            clan,
            ts,
          ]
        )
      );
    } catch (e) {
      console.error(
        'store tanks totals failed:',
        JSON.stringify(line.parsed),
        e
      );
    }

    try {
      // Weekly stats
      const weekStart = new Date(ts);
      weekStart.setUTCHours(0, 0, 0, 0);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

      await enqueuePrivateDb('tanks_weekly insert', () =>
        connection.execute(
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
        )
      );
    } catch (e) {
      console.error('store weekly failed:', line.parsed, e);
    }
  }
}

export async function storeInShipsDb(
  lines: RawWithParsed[],
  message: Message<boolean>
) {
  const dayToday = new Date().toISOString().slice(0, 10);
  for (const line of lines) {
    if (line.parsed == undefined) continue;
    const { rank, gid, clan, username, score, kills, deaths } = line.parsed;
    const ts = message.createdAt;

    try {
      await enqueueSharedDb('ships_history insert', () =>
        connection.execute(
          `INSERT INTO ships_history
            (gid, username, clan_tag, rank, kills, deaths, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            gid,
            username,
            clan ?? null, // avoid "undefined"
            rank,
            kills,
            deaths,
            ts, // mysql2 will serialize Date -> DATETIME/TIMESTAMP
          ]
        )
      );
    } catch (e) {
      console.error(
        'store ships history failed:',
        JSON.stringify(line.parsed),
        e
      );
    }

    try {
      // Totals
      const entryKd = deaths > 0 ? kills / deaths : kills; // current entry KD

      await enqueuePrivateDb('ships_totals insert', () =>
        connection.execute(
          `INSERT INTO ships_totals (
                      gid,
                      total_kills,
                      total_deaths,
                      avg_kd,
                      num_entries,
                      highest_kd,
                      highest_kd_date,
                      highest_kd_kills,
                      highest_kd_deaths,
                      highest_kills,
                      highest_kills_date,
                      highest_deaths,
                      highest_deaths_date,
                      all_names,
                      recent_name,
                      recent_clan_tag,
                      last_entry
                  )
                  VALUES (
                      ?, ?, ?, ?, 1,
                      ?, ?, ?, ?,
                      ?, ?, ?, ?,
                      JSON_ARRAY(?),
                      ?, ?, ?
                  )
                  ON DUPLICATE KEY UPDATE
                      total_kills = total_kills + VALUES(total_kills),
                      total_deaths = total_deaths + VALUES(total_deaths),
                      num_entries = num_entries + 1,
                      avg_kd = (
                          (avg_kd * (num_entries - 1)) + VALUES(highest_kd)
                      ) / num_entries,
            
                      -- Highest KD (per entry)
                      highest_kd = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(highest_kd) ELSE highest_kd END,
                      highest_kd_date = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(last_entry) ELSE highest_kd_date END,
                      highest_kd_kills = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(highest_kd_kills) ELSE highest_kd_kills END,
                      highest_kd_deaths = CASE WHEN VALUES(highest_kd) > highest_kd THEN VALUES(highest_kd_deaths) ELSE highest_kd_deaths END,
            
                      -- Highest kills
                      highest_kills = GREATEST(highest_kills, VALUES(highest_kills)),
                      highest_kills_date = CASE WHEN VALUES(highest_kills) > highest_kills THEN VALUES(last_entry) ELSE highest_kills_date END,
                      highest_kills_deaths = CASE WHEN VALUES(total_kills) > highest_kills THEN VALUES(total_deaths) ELSE highest_kills_deaths END,
            
                      -- Highest deaths
                      highest_deaths = GREATEST(highest_deaths, VALUES(highest_deaths)),
                      highest_deaths_date = CASE WHEN VALUES(highest_deaths) > highest_deaths THEN VALUES(last_entry) ELSE highest_deaths_date END,
                      highest_deaths_kills = CASE WHEN VALUES(total_deaths) > highest_deaths THEN VALUES(total_kills) ELSE highest_deaths_kills END,
            
                      -- Name and metadata
                      all_names = IF(JSON_CONTAINS(all_names, JSON_QUOTE(VALUES(recent_name))),
                                      all_names,
                                      JSON_ARRAY_APPEND(all_names, '$', VALUES(recent_name))),
                      recent_name = VALUES(recent_name),
                      recent_clan_tag = VALUES(recent_clan_tag),
                      last_entry = VALUES(last_entry);`,
          [
            gid,
            kills,
            deaths,
            entryKd, // avg_kd (initial)
            entryKd, // highest_kd
            ts, // highest_kd_date
            kills, // highest_kd_kills
            deaths, // highest_kd_deaths
            kills, // highest_kills
            ts, // highest_kills_date
            deaths, // highest_deaths
            ts, // highest_deaths_date
            username, // JSON_ARRAY(?)
            username,
            clan,
            ts,
          ]
        )
      );
    } catch (e) {
      console.error(
        'store ships totals failed:',
        JSON.stringify(line.parsed),
        e
      );
    }

    try {
      // daily stats
      await enqueuePrivateDb('ships_daily_totals insert', () =>
        connection.execute(
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
                avg_kd = (total_kills + VALUES(total_kills)) /
                         GREATEST(1, total_deaths + VALUES(total_deaths)),
                highest_kd = GREATEST(highest_kd, VALUES(highest_kd)),
                highest_kills = GREATEST(highest_kills, VALUES(highest_kills)),
                highest_deaths = GREATEST(highest_deaths, VALUES(highest_deaths)),
                recent_name = VALUES(recent_name),
                recent_clan_tag = VALUES(recent_clan_tag),
                last_entry = VALUES(last_entry);`,
          [
            gid,
            dayToday,
            kills,
            deaths,
            deaths > 0 ? kills / deaths : kills, // avg_kd
            deaths > 0 ? kills / deaths : kills, // highest_kd
            kills,
            deaths,
            username,
            clan,
            ts,
          ]
        )
      );
    } catch (e) {
      console.error('store weekly failed:', line.parsed, e);
    }
  }
}
