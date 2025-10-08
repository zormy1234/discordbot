import {
  Client,
  Message,
  TextBasedChannel,
  GuildBasedChannel,
  TextChannel,
  NewsChannel,
  ThreadChannel,
} from 'discord.js';
import connection, { DBRow } from '../database/connect.js';
import {
  ParsedLine,
  RawWithParsed as RawWithParsed,
} from './ReceiveWinlogs.js';
import { enqueuePrivateDb, enqueueSharedDb } from '../database/dbQueue.js';

interface ClanDiscordDetailsRow extends DBRow {
  guild_id: string;
  tanks_clan_tag: string;
  tanks_winlog_channel_id: string;
}

export default async function forwardWinlogs(
  client: Client,
  lines: RawWithParsed[]
): Promise<void> {
  console.log('attempting to forward winlogs');
  try {
    const result = await connection.execute<ClanDiscordDetailsRow[]>(
      `SELECT guild_id, tanks_clan_tag, tanks_winlog_channel_id 
        FROM clan_discord_details
        WHERE tanks_clan_tag IS NOT NULL AND tanks_clan_tag != ''`
    );

    if (Array.isArray(result)) {
      const [rows] = result;

      const clanMap = new Map<
        string,
        { guildId: string; winlogChannelId: string }[]
      >();
      console.log(`attempting to forward winlogs for clans ${clanMap.keys}`);

      for (const row of rows) {
        if (!clanMap.has(row.tanks_clan_tag)) {
          clanMap.set(row.tanks_clan_tag, []);
        }
        clanMap.get(row.tanks_clan_tag)!.push({
          guildId: row.guild_id,
          winlogChannelId: row.tanks_winlog_channel_id,
        });
      }

      for (const line of lines) {
        if (line.parsed == undefined) return;

        const clanTag = line.parsed?.clan;
        if (!clanTag || clanTag == '') continue;

        const clanDetails = clanMap.get(clanTag);
        if (!clanDetails) continue;

        for (const row of clanDetails) {
          const guild = client.guilds.cache.get(row.guildId);
          if (!guild) continue;

          const channel = guild.channels.cache.get(row.winlogChannelId) as
            | GuildBasedChannel
            | undefined;

          if (channel && channel.isTextBased()) {
            const winlogChannel = channel as
              | TextChannel
              | NewsChannel
              | ThreadChannel;
            await winlogChannel.send(`\`\`\`\n${line.raw}\n\`\`\``);
          }
        }
      }
    }
  } catch (e) {
    console.error('forward winlogs failed', e);
  }
}
