import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import connection from '../database/connect.js';
import { RowDataPacket } from 'mysql2/promise';

export const data = new SlashCommandBuilder()
  .setName('tanks_total_stats')
  .setDescription('Get total and average stats for a given GID')
  .addStringOption((option) =>
    option.setName('gid').setDescription('The GID to look up').setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: false });

  try {
    const gid = interaction.options.getString('gid', true);

    const [rows] = (await connection.execute(
      'SELECT total_kills, total_deaths, recent_name, recent_clan_tag, total_score, total_rank, num_entries, highest_score FROM tanks_totals WHERE gid = ?',
      [gid]
    )) as RowDataPacket[];

    if (!rows.length) {
      return interaction.editReply({
        content: `❌ No data found for GID \`${gid}\`.`,
      });
    }

    const stats = rows[0];
    const kdRatio =
      stats.total_deaths > 0
        ? (stats.total_kills / stats.total_deaths).toFixed(2)
        : '∞';

    const embed = new EmbedBuilder()
      .setTitle(
        `📊 Stats for ${stats.recent_clan_tag} | ${stats.recent_name || 'Unknown'} (${gid})`
      )
      .setColor(0x00ff00)
      .addFields(
        {
          name: 'Total Kills',
          value: Number(stats.total_kills).toLocaleString(),
          inline: false,
        },
        {
          name: 'Total Deaths',
          value: Number(stats.total_deaths).toLocaleString(),
          inline: false,
        },
        { name: 'Kill/Death Ratio', value: kdRatio, inline: false },
        {
          name: 'Average Score',
          value: Number(
            (stats.total_score / stats.num_entries).toFixed(0)
          ).toLocaleString(),
          inline: false,
        },
        {
          name: 'Highest Score',
          value: Number(stats.highest_score.toFixed(0)).toLocaleString(),
          inline: false,
        },
        {
          name: 'Average Rank',
          value: (stats.total_rank / stats.num_entries).toFixed(2),
          inline: false,
        }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Stats command error:', err);
    return interaction.editReply({
      content: '❌ Something went wrong fetching stats for this GID.',
    });
  }
}
