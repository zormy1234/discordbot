import connection from '../database/connect.js';

export default function registerForwardWinlogs(client) {
  client.on('messageCreate', async (message) => {
    // Ignore self
    if (message.author.id === client.user.id) return;

    // 2. Only listen in specific source guild/channel
    if (
      //   message.guild?.id !== '1263192728884346913' ||
      //   message.channel.id !== '1363104979342065896'
      message.guild?.id !== '1171502780108771439' ||
      message.channel.id !== '1411760098392539267'
    )
      return;

    // 3. Split message into lines (ignore code block markers if present)
    const content = message.content.replace(/```/g, '');
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const [rows] = await connection.execute(
      `SELECT guild_id, tanks_clan_tag, tanks_winlog_channel_id 
         FROM clan_discord_details
         WHERE tanks_clan_tag IS NOT NULL AND tanks_clan_tag != ''`
    );

    const clanMap = new Map();

    for (const row of rows) {
      if (!clanMap.has(row.tanks_clan_tag)) {
        clanMap.set(row.tanks_clan_tag, []);
      }
      clanMap.get(row.tanks_clan_tag).push({
        guildId: row.guild_id,
        winlogChannelId: row.tanks_winlog_channel_id,
      });
    }

    for (const line of lines) {
      const columns = line.split(/\s+/);
      if (!columns[0]) continue;

      const clanTag = columns[0];
      const clan_details = clanMap.get(clanTag);
      if (!clan_details) continue;

      // 5. Iterate over each guild result
      for (const row of clan_details) {
        const guild = client.guilds.cache.get(row.guildId);
        if (!guild) continue;

        const winlogChannel = guild.channels.cache.get(row.winlogChannelId);
        if (!winlogChannel?.isTextBased()) continue;

        // 6. Forward the line
        await winlogChannel.send(`\`\`\`\n${line}\n\`\`\``);
      }
    }
  });
}
