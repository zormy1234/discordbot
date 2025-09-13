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

interface ClanDiscordDetailsRow extends DBRow {
  guild_id: string;
  tanks_clan_tag: string;
  tanks_winlog_channel_id: string;
}

export default function registerForwardWinlogs(client: Client): void {
  client.on('messageCreate', async (message: Message) => {
    if (message.author.id === client.user?.id) return;

    if (
        // message.guild?.id !== '1263192728884346913' ||
        // message.channel.id !== '1363104979342065896'
      message.guild?.id !== '1171502780108771439' ||
      message.channel.id !== '1411760098392539267'
    )
      return;

      const content = message.content.replace(/```/g, '');
      const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
      console.log(`recieved message on channel starting with line ${lines[0]}`)

    const [rows] = await connection.execute<ClanDiscordDetailsRow[]>(
      `SELECT guild_id, tanks_clan_tag, tanks_winlog_channel_id 
       FROM clan_discord_details
       WHERE tanks_clan_tag IS NOT NULL AND tanks_clan_tag != ''`
    );

    const clanMap = new Map<
      string,
      { guildId: string; winlogChannelId: string }[]
    >();

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
      const columns = line.split(/\s+/);
      if (columns.length < 4) continue;

      const clanTag = columns[3]?.trim();
      if (!clanTag) continue;

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
          await winlogChannel.send(`\`\`\`\n${line}\n\`\`\``);
        }
      }
    }
  });
}
