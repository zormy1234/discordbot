/*
// src/commands/weekly_score.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import connection from '../database/connect.js';
import QuickChart from 'quickchart-js';
import { RowDataPacket } from 'mysql2/promise';

export const data = new SlashCommandBuilder()
  .setName('weekly_score')
  .setDescription('Show weekly total scores per player')
  .addStringOption((option) =>
    option
      .setName('clan')
      .setDescription('Filter leaderboard by clan tag (optional)')
      .setRequired(false)
  );

// Define a proper TypeScript type for the rows
interface WeeklyScoreRow extends RowDataPacket {
  player_name: string;
  total_score: number;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: false });

  try {
    const clan = interaction.options.getString('clan');

    // Build query
    let query = `
      SELECT player_name, total_score
      FROM weekly_kd
    `;
    const params: (string | number)[] = [];

    if (clan) {
      query += ` WHERE clan_tag = ?`;
      params.push(clan);
    }

    query += ` ORDER BY total_score DESC LIMIT 50`;

const result = await connection.execute<RowDataPacket[]>(query, params);
const rows = result[0] as WeeklyScoreRow[];

    const typedRows = rows as WeeklyScoreRow[];

    if (!typedRows.length) return interaction.editReply('❌ No data found.');

    // Prepare graph
    const labels = typedRows.map((r) => r.player_name);
    const dataValues = typedRows.map((r) => r.total_score);

    const qc = new QuickChart();
    qc.setConfig({
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Score',
            data: dataValues,
            backgroundColor: 'rgba(0, 132, 148, 0.7)',
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } },
          y: { beginAtZero: true },
        },
      },
    });
    qc.setWidth(800).setHeight(400).setBackgroundColor('white');

    const chartUrl = qc.getUrl();

    const embed = new EmbedBuilder()
      .setTitle(`Weekly Total Scores${clan ? ` — Clan [${clan}]` : ''}`)
      .setDescription('Top 50 players this week by total score')
      .setImage(chartUrl)
      .setColor(0x008494);

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Weekly score command error:', err);
    await interaction.editReply('❌ Failed to fetch weekly scores.');
  }
}
*/