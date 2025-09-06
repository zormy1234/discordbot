import connection from "../database/connect.js";

export default function registerForwardWinlogs(client) {
  client.on("messageCreate", async (message) => {
    // 1. Ignore bots
    if (message.author.bot) return;

    // 2. Only listen in specific source guild/channel
    if (
      message.guild?.id !== "1263192728884346913" ||
      message.channel.id !== "1363104979342065896"
    ) return;

    // 3. Split message into lines (ignore code block markers if present)
    const content = message.content.replace(/```/g, "");
    const lines = content.split("\n").map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      const columns = line.split(/\s+/);
      if (!columns[0]) continue;

      const clanTag = columns[0];

      try {
        // 4. Lookup ALL guilds with matching clan_tag
        const [rows] = await connection.execute(
          "SELECT guild_id, tanks_winlog_channel_id FROM clan_discord_details WHERE tanks_clan_tag = ?",
          [clanTag]
        );

        if (!rows.length) continue;
        
        // 5. Iterate over each guild result
        for (const row of rows) {
          const guild = client.guilds.cache.get(row.guild_id);
          if (!guild) continue;
          
          const winlogChannel = guild.channels.cache.get(row.tanks_winlog_channel_id);
          if (!winlogChannel?.isTextBased()) continue;

          // 6. Forward the line
          await winlogChannel.send(`\`\`\`\n${line}\n\`\`\``);
        }
      } catch (err) {
        console.error("❌ DB/Forward error:", err);
      }
    }
  });
}
