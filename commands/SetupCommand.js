import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import connection from '../database/connect.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription(
    'Initial setup: set the moderator role, optional winlog channel, and optional clan tag'
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption((option) =>
    option
      .setName('modrole')
      .setDescription('Select the moderator role')
      .setRequired(true)
  );

export async function execute(interaction) {
  const guildId = interaction.guild.id;

  const [rows] = await connection.execute(
    'SELECT * FROM clan_discord_details WHERE guild_id = ?',
    [guildId]
  );
  const existing = rows[0];

  const modRole = interaction.options.getRole('modrole');

  await connection.execute(
    `INSERT INTO clan_discord_details (guild_id, mod_role_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE
       mod_role_id = VALUES(mod_role_id)`,
    [guildId, modRole.id]
  );

  if (existing) {
    return interaction.reply({
      content: `⚠️ Moderator role changed from <@&${existing.mod_role_id}> to <@&${modRole.id}>.`,
      flags: 64,
    });
  }

  return interaction.reply(
    `✅ Setup complete!\nModerator role: <@&${modRole.id}>`
  );
}
