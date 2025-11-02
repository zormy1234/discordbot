import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} from 'discord.js';
import connection from '../database/connect.js';
import { RowDataPacket } from 'mysql2/promise';

export const data = new SlashCommandBuilder()
  .setName('ships_leaderboard')
  .setDescription(
    'Show top 50 players by kills, K/D, avg K/D'
  )
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('Leaderboard type')
      .setRequired(true)
      .addChoices(
        { name: 'Highest Kills', value: 'highest_kills' },
        { name: 'Highest K/D', value: 'highest_kd' },
        { name: 'Average K/D', value: 'avg_kd' }
      )
  )
  .addStringOption((option) =>
    option
      .setName('clan')
      .setDescription('Filter leaderboard by clan tag (optional)')
      .setRequired(false)
  );

const typeNames: Record<string, string> = {
  highest_kills: 'Highest Kills',
  highest_kd: 'Highest K/D',
  avg_kd: 'Average K/D (min 5 games played)',
};

interface LeaderboardRow extends RowDataPacket {
    gid: number;
    recent_name: string;
    recent_clan_tag: string | null;
    highest_kills?: number;
    highest_kd?: number;
    avg_kd?: number;
    num_entries?: number;
  }

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: false });

  try {
    const type = interaction.options.getString('type', true);
    const clan = interaction.options.getString('clan')?.trim() || null;

    let query = '';
    const params: any[] = [];

    // Base query
    if (type === 'avg_kd') {
      query = `
          SELECT gid, recent_name, recent_clan_tag, avg_kd, num_entries
          FROM ships_totals
          WHERE num_entries >= 2
        `;
    } else {
      query = `
          SELECT gid, recent_name, recent_clan_tag, highest_kills, highest_kd
          FROM ships_totals
          WHERE 1=1
        `;
    }

    if (clan) {
      query += ` AND recent_clan_tag = ?`;
      params.push(clan);
    }

    query += ` ORDER BY ${type} DESC LIMIT 50`;

    // Execute leaderboard query
    const [rows] = (await connection.execute<RowDataPacket[]>(
      query,
      params
    )) as [LeaderboardRow[], any];

    // Fetch global averages 
    const [avgRows] = (await connection.execute<RowDataPacket[]>(
      `SELECT
          AVG(highest_kills) AS avg_highest_kills,
          AVG(highest_kd) AS avg_highest_kd,
          AVG(avg_kd) AS avg_avg_kd
        FROM ships_totals
        WHERE num_entries >= 2`
    )) as [LeaderboardRow[], any];

    const averages = avgRows[0];

    if (!rows.length) {
      return interaction.editReply(
        clan ? `❌ No data found for clan **${clan}**.` : '❌ No data found.'
      );
    }

    const pages: EmbedBuilder[] = [];
    for (let i = 0; i < rows.length; i += 10) {
      const pageRows = rows.slice(i, i + 10);
      let description = '';

      pageRows.forEach((r, idx) => {
        const value = (() => {
          switch (type) {
            case 'highest_kills':
              return Number(r.highest_kills).toLocaleString();
            case 'highest_kd':
              return Number(r.highest_kd).toFixed(2);
            case 'avg_kd':
              return Number(r.avg_kd).toFixed(2);
          }
        })();

          const name = r.recent_clan_tag
            ? `[${r.recent_clan_tag}] ${r.recent_name}`
            : r.recent_name;
          description += `${i + idx + 1}. ${name} — ${value}\n`;
        }
      );

      if (type === 'avg_kd') {
        description += `\nGlobal avg K/D (≥2 games): ${averages.avg_avg_kd.toFixed(2)}`;
      } else if (type === 'highest_kills') {
        description += `\nGlobal avg highest kills: ${Number(averages.avg_highest_kills).toFixed(0)}`;
      } else if (type === 'highest_kd') {
        description += `\nGlobal avg highest K/D: ${averages.avg_highest_kd.toFixed(2)}`;
      }

      const embed = new EmbedBuilder()
        .setTitle(
          `Leaderboard — ${typeNames[type]}${clan ? ` (Clan: ${clan})` : ''}`
        )
        .setDescription(description)
        .setColor(0x008494)
        .setFooter({
          text: `Page ${Math.floor(i / 10) + 1}/${Math.ceil(rows.length / 10)}`,
        });

      pages.push(embed);
    }

    let currentPage = 0;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('prev')
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('next')
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(pages.length <= 1)
    );

    const message = await interaction.editReply({
      embeds: [pages[currentPage]],
      components: [row],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 2 * 60 * 1000,
    });

    collector.on('collect', async (btn) => {
      if (!btn.isButton()) return;
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({
          content: 'You cannot control this leaderboard.',
          ephemeral: true,
        });
      }

      if (btn.customId === 'prev') currentPage--;
      if (btn.customId === 'next') currentPage++;

      const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('prev')
          .setLabel('⬅️ Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Next ➡️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === pages.length - 1)
      );

      await btn.update({ embeds: [pages[currentPage]], components: [newRow] });
    });

    collector.on('end', async () => {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('prev')
          .setLabel('⬅️ Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Next ➡️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true)
      );
      await interaction.editReply({ components: [disabledRow] });
    });
  } catch (err) {
    console.error('Leaderboard command error:', err);
    return interaction.editReply('❌ Failed to fetch leaderboard.');
  }
}
