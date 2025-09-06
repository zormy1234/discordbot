import { SlashCommandBuilder } from "discord.js";
import connection from "../database/connect.js";

export const data = new SlashCommandBuilder()
  .setName("set_tanks_winlogs")
  .setDescription("Update the winlog channel and clan tag (requires mod role)")
  .addChannelOption(option =>
    option
      .setName("winlog")
      .setDescription("Set the winlog channel")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("clan_tag")
      .setDescription("Set the clan tag")
      .setRequired(true)
  );

export async function execute(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  // Get stored setup for this guild
  const [rows] = await connection.execute(
    "SELECT * FROM clan_discord_details WHERE guild_id = ?",
    [guildId]
  );
  const setup = rows[0];

  if (!setup) {
    return interaction.reply({
      content: "⚠️ You must run `/setup` first.",
      flags: 64, 
    });
  }

  // Check if user has the mod role
  const member = await interaction.guild.members.fetch(userId);
  console.log("HERE" + member.roles.cache)
  if (!member.roles.cache.some(role => role.id == setup.mod_role_id)) {
    return interaction.reply({
      content: "⚠️ You must have the mod role to run this command.",
      flags: 64,
    });
  }

  // Get required options
  const winlogChannel = interaction.options.getChannel("winlog");
  const clanTag = interaction.options.getString("clan_tag");

  // Update the database
  await connection.execute(
    `UPDATE clan_discord_details
     SET tanks_winlog_channel_id = ?,
         tanks_clan_tag = ?
     WHERE guild_id = ?`,
    [winlogChannel.id, clanTag, guildId]
  );

  return interaction.reply({
    content: `✅ Settings updated.\n` +
             `New Winlog channel: <#${winlogChannel.id}>\n` +
             `New Clan Tag: ${clanTag}`,
    flags: 64,
  });
}
