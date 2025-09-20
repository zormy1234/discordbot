import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import connection from '../database/connect.js';
import { RowDataPacket } from 'mysql2/promise';

export const data = new SlashCommandBuilder()
  .setName('tanks_total_stats')
  .setDescription('Get total stats for a given GID')
  .addStringOption((option) =>
    option.setName('gid').setDescription('The GID to look up').setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: false });

  try {
    const gid = interaction.options.getString('gid', true);

    const [rows] = (await connection.execute(
      `SELECT 
          total_kills, 
          total_deaths, 
          total_score, 
          number_top5, 
          number_top20, 
          recent_name, 
          recent_clan_tag
       FROM tanks_totals 
       WHERE gid = ?`,
      [gid]
    )) as RowDataPacket[];

    if (!rows.length) {
      return interaction.editReply({
        content: `❌ No data found for GID \`${gid}\`.`,
      });
    }

    const stats = rows[0];

    const embed = new EmbedBuilder()
      .setTitle(
        `📊 Stats for ${stats.recent_clan_tag || ''} ${stats.recent_name || 'Unknown'} (${gid})`
      )
      .setColor(0x00ff00)
      .addFields(
        {
          name: 'Total Score',
          value: Number(stats.total_score).toLocaleString(),
          inline: false,
        },
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
        {
          name: 'Total K/D Ratio',
          value: Number(stats.total_kills / stats.total_deaths).toLocaleString(),
          inline: false,
        },
        {
          name: 'Number of Top 5 Finishes',
          value: Number(stats.number_top5).toLocaleString(),
          inline: false,
        },
        {
          name: 'Number of Top 20 finishes',
          value: Number(stats.number_top20).toLocaleString(),inline: false,
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
