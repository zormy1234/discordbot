import connection from '../database/connect.js';
import { writeWinLog } from './dbLog.js';

export default function registerForwardWinlogs(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.id === client.user?.id) return;

    // Channel/guild filter (keep as-is)
    if (
      // test
      // message.guild?.id !== '1263192728884346913' ||
      // message.channel.id !== '1363104979342065896'
      // prod
      message.guild?.id !== '1171502780108771439' ||
      message.channel.id !== '1411760098392539267'
    ) return;

    const content = message.content.replace(/```/g, '');
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    console.log(`received message on channel starting with line ${lines[0]}`);

    // Pull per-guild config set by /setup.
    // Treat NULL/'' clan tags as wildcard (ALL).
    const [rows] = await connection.execute(
      `SELECT guild_id,
              NULLIF(TRIM(tanks_clan_tag), '') AS tanks_clan_tag,
              NULLIF(TRIM(tanks_winlog_channel_id), '') AS tanks_winlog_channel_id
         FROM clan_discord_details
        WHERE NULLIF(TRIM(tanks_winlog_channel_id), '') IS NOT NULL`
    );

    // Build: tag -> recipients, and a wildcard recipients list
    const tagMap = new Map();            // key = UPPER(tag)
    const wildcard = [];                 // rows with no clan tag (ALL)
    const add = (k, val) => {
      const key = k.toUpperCase();
      if (!tagMap.has(key)) tagMap.set(key, []);
      tagMap.get(key).push(val);
    };

    for (const r of rows) {
      const recipient = { guildId: r.guild_id, channelId: r.tanks_winlog_channel_id };
      if (r.tanks_clan_tag) add(r.tanks_clan_tag, recipient);
      else wildcard.push(recipient); // “ALL” via /setup (no clan tag provided)
    }

    for (const line of lines) {
      const columns = line.split(/\s+/);
      if (columns.length < 7) continue;

      const clanTag = columns[2]?.trim();
      const tagKey = (clanTag ?? '').toUpperCase();

      // Always log the raw line
      try {
        await writeWinLog({
          ts: new Date(), // Date object avoids DATETIME parsing issues
          level: 'info',
          source: 'discord:winlogs-forwarder',
          host: message.guild?.id ?? 'unknown',
          message: line,
          raw: {
            messageId: message.id,
            guildId: message.guild?.id ?? null,
            channelId: message.channel.id,
            authorId: message.author.id,
            clanTag: clanTag || null,
            firstLine: lines[0] ?? null,
          },
        });
      } catch (e) {
        console.error('writeWinLog failed:', e?.message || e);
      }

      // Recipients = specific tag matches + ALL (wildcard) subscribers
      const recipients = [
        ...(tagMap.get(tagKey) ?? []),
        ...wildcard,
      ];

      if (recipients.length === 0) continue;

      // Dedupe per (guildId:channelId)
      const seen = new Set();
      for (const r of recipients) {
        const key = `${r.guildId}:${r.channelId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const guild = client.guilds.cache.get(r.guildId);
        if (!guild) continue;

        const channel = guild.channels.cache.get(r.channelId);
        if (channel && channel.isTextBased()) {
          try {
            await channel.send(`\`\`\`\n${line}\n\`\`\``);
          } catch (err) {
            console.error(`winlog forward failed ${key}:`, err?.message || err);
          }
        }
      }
    }
  });
}

