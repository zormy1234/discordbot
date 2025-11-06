import {
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    Role,
    SlashCommandBuilder
} from 'discord.js';
import connection from '../database/connect.js';

export const data = new SlashCommandBuilder()
  .setName('bounty_setter_role')
  .setDescription('Set the role allowed to create bounties')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addRoleOption((opt) =>
    opt
      .setName('role')
      .setDescription('Role that can create bounties')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const role = interaction.options.getRole('role', true) as Role;
  await setBountySetterRole(interaction.guildId, role);

  return interaction.reply({
    content: `✅ The role <@&${role.id}> can now set bounties.`,
    ephemeral: true,
  });
}

async function setBountySetterRole(guildId: string | null, role: Role) {
  await connection.execute(
    `INSERT INTO bounty_config (guild_id, bounty_role_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE bounty_role_id = VALUES(bounty_role_id)`,
    [guildId, role.id]
  );
}