const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const connection = require('../database/connect.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Initial setup: set the moderator role and winlog channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // only admins
    .addRoleOption(option =>
      option.setName("modrole")
        .setDescription("Select the moderator role")
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName("winlog")
        .setDescription("Channel where winlogs will be posted")
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    // Check if setup already exists
    const existing = db.prepare("SELECT * FROM clan_discord_details WHERE guild_id = ?").get(guildId);
    if (existing) {
      return interaction.reply({
        content: "⚠️ Setup has already been completed for this server.",
        ephemeral: true,
      });
    }

    // Get inputs
    const modRole = interaction.options.getRole("modrole");
    const winlogChannel = interaction.options.getChannel("winlog");

    // Save to DB
    connection.prepare("INSERT INTO clan_discord_details (guild_id, mod_role_id, winlog_channel_id) VALUES (?, ?, ?)")
      .run(guildId, modRole.id, winlogChannel.id);

    return interaction.reply(
      `✅ Setup complete!\nModerator role: <@&${modRole.id}>\nWinlog channel: <#${winlogChannel.id}>`
    );
  },
};
