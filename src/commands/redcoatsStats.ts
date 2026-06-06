import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  AttachmentBuilder,
  ComponentType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import connection from '../database/connect.js';
import { RowDataPacket } from 'mysql2/promise';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration } from 'chart.js';

const chartCanvas = new ChartJSNodeCanvas({
  width: 1200,
  height: 600,
});

export const data = new SlashCommandBuilder()
  .setName('redcoats')
  .setDescription('Redcoats commands')

  .addSubcommand((sub) =>
    sub
      .setName('stats')
      .setDescription('Get player stats')
      .addStringOption((o) =>
        o.setName('name').setDescription('Player name').setRequired(true)
      )
      .addStringOption((o) =>
        o.setName('clan').setDescription('Clan').setRequired(false)
      )
  )

  .addSubcommand((sub) =>
    sub
      .setName('leaderboard')
      .setDescription('Leaderboard')
      .addStringOption((o) =>
        o.setName('metric').setDescription('Metric').addChoices(
          // { name: 'Total Player Kills', value: 'total_player_kills' },
          { name: 'Highest Score', value: 'highest_score' },
          { name: 'Average KD', value: 'average_kd' },
          { name: 'Best Single Game KD', value: 'best_single_game_kd' }
        )
      )
      .addBooleanOption((o) =>
        o
          .setName('alltime')
          .setDescription('Use all time stats')
          .setRequired(false)
      )
  )

  .addSubcommand((sub) =>
    sub
      .setName('graph')
      .setDescription('Player graph')
      .addStringOption((o) =>
        o.setName('name').setDescription('Player name').setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName('metric')
          .setDescription('Metric')
          .setRequired(true)
          .addChoices(
            { name: 'Kills', value: 'total_kills' },
            { name: 'KD Ratio', value: 'average_kd' }
          )
      )
      .addIntegerOption((o) =>
        o
          .setName('months')
          .setDescription('How many months of data (leave empty for all time)')
          .setRequired(false)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const sub = interaction.options.getSubcommand();

  try {
    // =========================
    // STATS
    // =========================
    if (sub === 'stats') {
      const name = interaction.options.getString('name', true);
      const clan = interaction.options.getString('clan');

      const [rows] = await connection.execute<RowDataPacket[]>(
        `
        SELECT
          gid,
          latest_username,
          latest_clan,
          total_player_kills,
          total_kills,
          average_kd,
          best_single_game_kd,
          total_games
        FROM redcoats_player_stats
        WHERE latest_username LIKE ?
        ${clan ? 'AND latest_clan = ?' : ''}
        ORDER BY total_player_kills DESC
        LIMIT 5
        `,
        clan ? [`%${name}%`, clan] : [`%${name}%`]
      );

      if (!rows.length) {
        return interaction.editReply(
          `❌ No Redcoats players found for **${name}**${
            clan ? ` in clan ${clan}` : ''
          }`
        );
      }

      const options = rows.map((r: any) => ({
        label: `${r.latest_username} ${r.latest_clan ? `[${r.latest_clan}]` : ''}`,
        description: `Kills: ${r.total_player_kills} | Games: ${r.total_games}`,
        value: r.gid.toString(),
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('redcoats_stats_select')
        .setPlaceholder('Select a player')
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        menu
      );

      await interaction.editReply({
        content: `Found ${rows.length} player(s) for **${name}**`,
        components: [row],
      });

      const msg = await interaction.fetchReply();

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000,
      });

      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({
            content: 'Not your selection.',
            ephemeral: true,
          });
        }

        const gid = i.values[0];

        const [statsRows] = await connection.execute<RowDataPacket[]>(
          `
          SELECT
            gid,
            latest_username,
            latest_clan,
            total_games,
            total_score,
            total_kills,
            total_player_kills,
            total_deaths,
            highest_score,
            average_kd,
            best_single_game_kd,
            last_seen
          FROM redcoats_player_stats
          WHERE gid = ?
          `,
          [gid]
        );

        if (!statsRows.length) {
          return i.update({
            content: '❌ No stats found for this player.',
            components: [],
          });
        }

        const s = statsRows[0];

        const totalKd =
          Number(s.total_deaths) > 0
            ? (Number(s.total_player_kills) / Number(s.total_deaths)).toFixed(2)
            : '∞';
        
        const killsPerGame =
          Number(s.total_games) > 0
            ? (
                Number(s.total_player_kills) /
                Number(s.total_games)
              ).toFixed(2)
            : '0';
        
        const embed = new EmbedBuilder()
          .setTitle(
            `📊 Stats for ${
              s.latest_clan ? `[${s.latest_clan}] ` : ''
            }${s.latest_username} (${gid})`
          )
          .setColor(0x3498db)
          .addFields(
            {
              name: '📈 Lifetime Total Stats',
              value:
                `Score: **${Number(s.total_score).toLocaleString()}**\n` +
                `Player Kills: **${Number(s.total_player_kills).toLocaleString()}**\n` +
                `Bot Kills: **${Number(s.total_kills).toLocaleString()}**\n` +
                `Deaths: **${Number(s.total_deaths).toLocaleString()}**\n` +
                `K/D: **${totalKd}**\n` +
                `Kills/Game: **${killsPerGame}**`,
              inline: false,
            },
            {
              name: '🏆 Personal Bests',
              value:
                `Highest Score: **${Number(s.highest_score).toLocaleString()}**\n` +
                `Best Match K/D: **${Number(s.best_single_game_kd).toFixed(2)}**`,
              inline: false,
            }
          );

        return i.update({
          content: `Stats for **${s.latest_username}**`,
          embeds: [embed],
          components: [],
        });
      });

      collector.on('end', async () => {
        await interaction.editReply({ components: [] });
      });

      return;
    }

    // =========================
    // LEADERBOARD
    // =========================
    if (sub === 'leaderboard') {
      const metric =
        interaction.options.getString('metric') || 'total_player_kills';
      const page = Math.max(interaction.options.getInteger('page') || 1, 1);
      const alltime = interaction.options.getBoolean('alltime') ?? false;

      const allowedMetrics = [
        'total_player_kills',
        'highest_score',
        'average_kd',
        'best_single_game_kd',
      ];

      if (!allowedMetrics.includes(metric)) {
        return interaction.editReply('Invalid metric');
      }

      const limit = 50;
      const offset = 0;

      let rows: RowDataPacket[] = [];

      if (alltime) {
        let orderColumn: string;

        switch (metric) {
          case 'total_player_kills':
            orderColumn = 'total_player_kills';
            break;

          case 'average_kd':
            orderColumn = 'average_kd';
            break;

          case 'highest_score':
            orderColumn = 'highest_score';
            break;

          case 'best_single_game_kd':
            orderColumn = 'best_single_game_kd';
            break;

          default:
            throw new Error('Invalid metric');
        }

        [rows] = await connection.execute<RowDataPacket[]>(
          `
    SELECT
      gid,
      latest_username,
      latest_clan,
      total_games,
      ${orderColumn} AS value
    FROM redcoats_player_stats
    WHERE total_games >= 5
    ORDER BY value DESC
    LIMIT ${limit}
    OFFSET ${offset}
    `
        );
      } else {
        switch (metric) {
          //
          // Total Player Kills (last 2 months)
          //
          case 'total_player_kills':
            [rows] = await connection.execute<RowDataPacket[]>(
              `
              SELECT
                ps.gid,
                ps.latest_username,
                ds.latest_clan,
                SUM(ds.total_player_kills) AS value,
                SUM(ds.games_played) AS total_games
              FROM redcoats_daily_stats ds
              JOIN redcoats_player_stats ps
                ON ps.gid = ds.gid
              WHERE ds.stat_date >= CURDATE() - INTERVAL 2 MONTH
              GROUP BY ds.gid
              HAVING total_games >= 5
              ORDER BY value DESC
              LIMIT ${limit}
              OFFSET ${offset}
        `
            );
            break;

          //
          // Average KD (last 2 months)
          //
          case 'average_kd':
            [rows] = await connection.execute<RowDataPacket[]>(
              `
                SELECT
                    ps.gid,
                    ps.latest_username,
                    ps.latest_clan,

                    AVG(ds.average_kd) AS value,

                    SUM(ds.games_played) AS total_games

                  FROM redcoats_daily_stats ds

                  JOIN redcoats_player_stats ps
                    ON ps.gid = ds.gid

                  WHERE ds.stat_date >= CURDATE() - INTERVAL 2 MONTH

                  GROUP BY ds.gid

                  HAVING total_games >= 5

                  ORDER BY value DESC

                  LIMIT ${limit}
                  OFFSET ${offset};
        `
            );
            break;

          //
          // Highest Score (last 2 months)
          //
          case 'highest_score':
            [rows] = await connection.execute<RowDataPacket[]>(
              `
        SELECT
          ps.gid,
          ps.latest_username,
          ps.latest_clan,
          MAX(gr.score) AS value,
          COUNT(*) AS total_games
        FROM redcoats_game_results gr
        JOIN redcoats_player_stats ps
          ON ps.gid = gr.gid
        WHERE gr.created_at >= NOW() - INTERVAL 2 MONTH
        GROUP BY gr.gid
        HAVING total_games >= 5
        ORDER BY value DESC
        LIMIT ${limit}
        OFFSET ${offset}
        `
            );
            break;

          //
          // Best Single Game KD (last 2 months)
          //
          case 'best_single_game_kd':
            [rows] = await connection.execute<RowDataPacket[]>(
              `
                SELECT
                    ps.gid,
                    ps.latest_username,
                    ps.latest_clan,
                    player_best.best_kd AS value,
                    player_best.total_games
                FROM (
                    SELECT
                        gr.gid,
                        MAX(gr.kd) AS best_kd,
                        COUNT(*) AS total_games
                    FROM redcoats_game_results gr
                    WHERE gr.created_at >= NOW() - INTERVAL 2 MONTH
                    GROUP BY gr.gid
                    HAVING total_games >= 5
                ) player_best
                JOIN redcoats_player_stats ps
                    ON ps.gid = player_best.gid
                ORDER BY player_best.best_kd DESC
                LIMIT ${limit}
                OFFSET ${offset};
        `
            );
            break;
        }
      }

      if (!rows.length) {
        return interaction.editReply('No leaderboard data');
      }

      const metricNames: Record<string, string> = {
        total_player_kills: 'Total Player Kills',
        average_kd: 'Average K/D',
        highest_score: 'Highest Score',
        best_single_game_kd: 'Best Single Game K/D',
      };

      const pages: EmbedBuilder[] = [];

      for (let i = 0; i < rows.length; i += 10) {
        const pageRows = rows.slice(i, i + 10);

        let description = '';

        pageRows.forEach((row, idx) => {
          const value =
            metric === 'average_kd' || metric === 'best_single_game_kd'
              ? Number(row.value).toFixed(2)
              : Number(row.value).toLocaleString();

          const clan = row.latest_clan ? `[${row.latest_clan}] ` : '';

          description += `${i + idx + 1}. ${clan}${row.latest_username} — ${value} \n`;
        });

        const embed = new EmbedBuilder()
          .setTitle(
            `${alltime ? 'All Time' : 'Last 2 Months'} ${metric} Leaderboard`
          )
          .setDescription(description)
          .setColor(0x008494)
          .setFooter({
            text: `Page ${Math.floor(i / 10) + 1}/${Math.ceil(
              rows.length / 10
            )}`,
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

        if (btn.customId === 'prev') {
          currentPage = currentPage === 0 ? pages.length - 1 : currentPage - 1;
        }

        if (btn.customId === 'next') {
          currentPage = currentPage === pages.length - 1 ? 0 : currentPage + 1;
        }

        const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('⬅️ Previous')
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Primary)
        );

        await btn.update({
          embeds: [pages[currentPage]],
          components: [updatedRow],
        });
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

        await interaction.editReply({
          embeds: [pages[0]],
          components: [disabledRow],
        });
      });
    }

    // =========================
    // GRAPH
    // =========================
    if (sub === 'graph') {
      const name = interaction.options.getString('name', true);
      const metric = interaction.options.getString('metric', true);

      const isKD = metric === 'average_kd';
      const isKills = metric === 'total_kills';

      const mode: 'kd' | 'kills' = isKD ? 'kd' : 'kills';
      const [rows] = await connection.execute<RowDataPacket[]>(
        `
        SELECT
          gid,
          latest_username,
          latest_clan,
          total_player_kills,
          total_kills,
          average_kd,
          total_games
        FROM redcoats_player_stats
        WHERE latest_username LIKE ?
        ORDER BY total_player_kills DESC
        LIMIT 5
        `,
        [`%${name}%`]
      );

      if (!rows.length) {
        return interaction.editReply(
          `❌ No Redcoats players found for **${name}**`
        );
      }

      const options = rows.map((r: any) => ({
        label: `${r.latest_username} ${r.latest_clan ? `[${r.latest_clan}]` : ''}`,
        description: `Kills: ${r.total_player_kills} | Games: ${r.total_games}`,
        value: r.gid.toString(),
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('redcoats_graph_select')
        .setPlaceholder('Select a player for graph')
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        menu
      );

      await interaction.editReply({
        content: `Found ${rows.length} player(s) for **${name}** — select one to graph`,
        components: [row],
      });

      const msg = await interaction.fetchReply();

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000,
      });

      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({
            content: 'Not your selection.',
            ephemeral: true,
          });
        }

        const gid = i.values[0];

        const months = interaction.options.getInteger('months');
        const [statsRows] = await connection.execute<RowDataPacket[]>(
          `
            SELECT *
            FROM redcoats_daily_stats
            WHERE gid = ?
            ${months ? 'AND stat_date >= NOW() - INTERVAL ? MONTH' : ''}
            ORDER BY stat_date ASC
            `,
          months ? [gid, months] : [gid]
        );

        if (!statsRows.length) {
          return i.update({
            content: '❌ No graph data found for this player.',
            components: [],
          });
        }

        const MAX_POINTS = 50;
        const n = statsRows.length;

        const labels: string[] = [];
        const kdData: number[] = [];
        const cumulativeBotKills: number[] = [];
        const cumulativePlayerKills: number[] = [];
        let botSum = 0;
        let playerSum = 0;

        if (n <= MAX_POINTS) {
          for (const r of statsRows) {
            labels.push(new Date(r.stat_date).toLocaleDateString());

            if (mode === 'kd') {
              kdData.push(Number(r.average_kd ?? 0));
            } else {
              botSum += Number(r.total_kills ?? 0);
              playerSum += Number(r.total_player_kills ?? 0);

              cumulativeBotKills.push(botSum);
              cumulativePlayerKills.push(playerSum);
            }
          }
        } else {
          const groupSize = Math.ceil(n / MAX_POINTS);

          for (let i = 0; i < n; i += groupSize) {
            const group = statsRows.slice(i, i + groupSize);

            const last = group[group.length - 1];
            labels.push(new Date(last.stat_date).toLocaleDateString());

            if (mode === 'kd') {
              const avgKd =
                group.reduce((sum, r) => sum + Number(r.average_kd ?? 0), 0) /
                group.length;

              kdData.push(avgKd);
            } else {
              for (const r of group) {
                botSum += Number(r.total_kills ?? 0);
                playerSum += Number(r.total_player_kills ?? 0);
              }

              cumulativeBotKills.push(botSum);
              cumulativePlayerKills.push(playerSum);
            }
          }
        }
        const configuration: ChartConfiguration<'line'> = {
          type: 'line',
          data: {
            labels,
            datasets:
              mode === 'kd'
                ? [
                    {
                      label: 'K/D Ratio',
                      data: kdData,
                      borderColor: 'rgba(0, 132, 148, 1)',
                      backgroundColor: 'rgba(0, 132, 148, 0.2)',
                      tension: 0.2,
                      borderWidth: 4,
                      pointRadius: 2,
                    },
                  ]
                : [
                    {
                      label: 'Cumulative Player Kills',
                      data: cumulativePlayerKills,
                      borderColor: 'rgba(0, 132, 148, 1)',
                      backgroundColor: 'rgba(0, 132, 148, 0.2)',
                      tension: 0.2,
                      borderWidth: 4,
                      pointRadius: 2,
                    },
                    {
                      label: 'Cumulative Bot Kills',
                      data: cumulativeBotKills,
                      borderColor: 'rgba(255, 99, 132, 1)',
                      backgroundColor: 'rgba(255, 99, 132, 0.2)',
                      tension: 0.2,
                      borderWidth: 4,
                      pointRadius: 2,
                    },
                  ],
          },
          options: {
            scales: {
              x: {
                title: {
                  display: true,
                  text: 'Date',
                  font: { size: 25, weight: 'bold' },
                  color: '#ffffff',
                },
                ticks: {
                  color: '#ffffff',
                  font: {
                    size: 20,
                  },
                },
              },
              y: {
                title: {
                  display: true,
                  text: mode === 'kd' ? 'K/D Ratio' : 'Cumulative Kills',
                  font: { size: 25, weight: 'bold' },
                  color: '#ffffff',
                },
                ticks: {
                  color: '#ffffff',
                  font: {
                    size: 25,
                  },
                },
                beginAtZero: true,
              },
            },
          },
        };

        const image = await chartCanvas.renderToBuffer(configuration);

        return i.update({
          content: `📈 Graph for **${rows.find((r: any) => r.gid == gid)?.latest_username || 'Player'}**`,
          embeds: [],
          components: [],
          files: [new AttachmentBuilder(image, { name: 'graph.png' })],
        });
      });

      collector.on('end', async () => {
        await interaction.editReply({ components: [] });
      });

      return;
    }
  } catch (err) {
    console.error('redcoats command error:', err);
    return interaction.editReply('❌ Something went wrong.');
  }
}
