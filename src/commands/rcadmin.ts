import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import connection from '../database/connect.js';

export const data = new SlashCommandBuilder()
  .setName('rcadmin')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDescription("admin stuff")
  .addSubcommand((sub) =>
    sub
      .setName('roles')
      .setDescription('Assign stat-based roles to linked players')
      .addStringOption((option) =>
        option
          .setName('stat')
          .setDescription('Stat to check')
          .setRequired(true)
          .addChoices(
            { name: 'Average KD', value: 'average_kd' },
            { name: 'Player Kills', value: 'total_player_kills' },
            { name: 'Bot Kills', value: 'total_kills' }
          )
      )
      .addNumberOption((option) =>
        option
          .setName('threshold')
          .setMinValue(0)
          .setDescription('Required value')
          .setRequired(true)
      )

      .addRoleOption((option) =>
        option.setName('role').setDescription('Role to award').setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('sync').setDescription('sync roles'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === 'roles') {
      const stat = interaction.options.getString('stat', true);
      const threshold = interaction.options.getNumber('threshold', true);
      const role = interaction.options.getRole('role', true);

      await connection.execute(
        `
      INSERT INTO redcoats_role_rules
      (
        guild_id,
        discord_role_id,
        stat_type,
        threshold,
        created_by
      )
      VALUES (?, ?, ?, ?, ?)
    `,
        [interaction.guildId, role.id, stat, threshold, interaction.user.id]
      );

      await interaction.reply({
        content: `Created rule: ${role} for ${stat} >= ${threshold}`,
        ephemeral: true,
      });
    }

    if (sub === 'sync') {
      const [rules] = await connection.query<any[]>(
        `
          SELECT *
          FROM redcoats_role_rules
          WHERE guild_id = ?
        `,
        [interaction.guildId]
      );

      const [rows] = await connection.query<any[]>(
        `
        SELECT
          l.discord_user_id,
      
          s.average_kd,
          s.total_player_kills,
          s.total_kills
      
        FROM redcoats_discord_links l
      
        JOIN redcoats_player_stats s
          ON s.gid = l.gid
        `
      );

      for (const row of rows) {
        const member = await interaction.guild?.members
          .fetch(row.discord_user_id)
          .catch(() => null);

        if (!member) continue;

        for (const rule of rules) {
          const role = interaction.guild?.roles.cache.get(rule.discord_role_id);

          if (!role) continue;

          const statValue = Number(row[rule.stat_type] ?? 0);

          const qualifies = statValue >= Number(rule.threshold);

          if (qualifies && !member.roles.cache.has(role.id)) {
            await member.roles.add(role);
          }

          if (!qualifies && member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
          }
        }
      }
      await interaction.reply({
        content: `sync complete`,
        ephemeral: false,
      });
    }
  } catch (err) {
    console.error('redcoats admin command error:', err);
    return interaction.editReply('❌ Something went wrong.');
  }
}
