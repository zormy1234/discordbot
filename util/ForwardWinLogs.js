import connection from "./database/connect.js";

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
    // Split columns by whitespace (assuming your format is tab/space separated)
    const columns = line.split(/\s+/);

    // Skip if first column is empty
    if (!columns[0]) continue;

    const firstCol = columns[0];

    // 4. Check DB for a guild that has this clan_tag
    const targetGuild = connection
      .execute("SELECT guild_id, winlog_channel_id FROM clan_discord_details WHERE clan_tag = ?", [firstCol])
      .get();

    if (!targetGuild) continue; // no match, skip

    // 5. Fetch the guild and channel in Discord
    const guild = client.guilds.cache.get(targetGuild.guild_id);
    if (!guild) continue;

    const winlogChannel = guild.channels.cache.get(targetGuild.winlog_channel_id);
    if (!winlogChannel || !winlogChannel.isTextBased()) continue;

    // 6. Forward the line
    await winlogChannel.send(`\`\`\`\n${line}\n\`\`\``);
  }
});
