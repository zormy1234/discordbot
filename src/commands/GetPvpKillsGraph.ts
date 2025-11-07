import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ComponentType,
} from 'discord.js';
import connection from '../database/connect.js';
import { RowDataPacket } from 'mysql2/promise';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';

export const data = new SlashCommandBuilder()
  .setName('ships_pvp_graph')
  .setDescription(
    'View a cumulative kills or average K/D graph for a Ships3D player'
  )
  .addStringOption((option) =>
    option
      .setName('mode')
      .setDescription('Graph mode')
      .setRequired(true)
      .addChoices(
        { name: 'Cumulative Kills', value: 'cumulative' },
        { name: 'Average K/D', value: 'avg_kd' }
      )
  )
  .addStringOption((option) =>
    option
      .setName('name')
      .setDescription('Player name to search for')
      .setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName('days')
      .setDescription('Optional: show graph over the last X days')
      .setRequired(false)
      .setMinValue(1)
  )
  .addStringOption((option) =>
    option
      .setName('clan')
      .setDescription('Optional clan tag to filter by')
      .setRequired(false)
  );

interface PlayerRow extends RowDataPacket {
  gid: string;
  recent_name: string;
  recent_clan_tag: string | null;
}

interface DailyTotalRow extends RowDataPacket {
  day: string;
  total_kills: number;
  avg_kd?: number;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const name = interaction.options.getString('name', true);
  const clan = interaction.options.getString('clan')?.trim() || null;
  const mode = interaction.options.getString('mode', true);
  const days = interaction.options.getInteger('days') ?? null;

  const MAX_POINTS = 50; // Always limit points to 50

  if (name.length < 2) {
    return interaction.editReply(
      '❌ Please enter a name longer than 1 character.'
    );
  }

  try {
    // Step 1: Search players
    const [rows] = await connection.execute<PlayerRow[]>(
      `
        SELECT gid, recent_name, recent_clan_tag
        FROM ships_totals
        WHERE recent_name LIKE ?
        ${clan ? 'AND recent_clan_tag = ?' : ''}
        ORDER BY recent_name
        LIMIT 5
        `,
      clan ? [`%${name}%`, clan] : [`%${name}%`]
    );

    if (!rows.length) {
      return interaction.editReply(
        `❌ No Ships3D players found for **${name}**${clan ? ` in clan ${clan}` : ''}.`
      );
    }

    // Step 2: Player selection menu
    const options = rows.map((r) => ({
      label: `${r.recent_name} ${r.recent_clan_tag ? `[${r.recent_clan_tag}]` : ''}`,
      description: `GID: ${r.gid}`,
      value: r.gid.toString(),
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_gid_graph')
      .setPlaceholder('Select a player to view graph')
      .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu
    );

    await interaction.editReply({
      content: `Found ${rows.length} matching player(s) for **${name}**:`,
      components: [row],
    });

    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60_000,
    });

    collector.on('collect', async (selectInteraction) => {
      if (selectInteraction.user.id !== interaction.user.id) {
        return selectInteraction.reply({
          content: 'You cannot use this selection — it’s not your lookup.',
          ephemeral: true,
        });
      }

      const gid = selectInteraction.values[0];

      // Step 3: Fetch daily totals
      let query = `
          SELECT day, total_kills, avg_kd, recent_name, recent_clan_tag
          FROM ships_daily_totals
          WHERE gid = ?
        `;
      const params: any[] = [gid];

      if (days) {
        query += ` AND day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`;
        params.push(days);
      }

      query += ` ORDER BY day ASC`;

      const [dailyRows] = await connection.execute<DailyTotalRow[]>(
        query,
        params
      );

      if (!dailyRows.length) {
        return selectInteraction.update({
          content: `❌ No daily stats found for this player (GID: ${gid}).`,
          components: [],
        });
      }

      // Step 4: Apply cumulative calculation and sampling
      const labels: string[] = [];
      const data: number[] = [];
      let cumulative = 0;

      const totalRows = dailyRows.length;
      const step = Math.max(1, Math.floor(totalRows / MAX_POINTS));

      for (let i = 0; i < totalRows; i += step) {
        const r = dailyRows[i];
        if (mode === 'cumulative') {
          cumulative += r.total_kills * step; // approximate if skipping
          data.push(cumulative);
        } else if (mode === 'avg_kd') {
          data.push(r.avg_kd ?? 0);
        }
        labels.push(new Date(r.day).toLocaleDateString());
      }

      // Step 5: Generate chart
      const width = 800;
      const height = 400;
      const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

      const configuration: ChartConfiguration<'line', number[], string> = {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: mode === 'cumulative' ? 'Cumulative Kills' : 'Average K/D',
              data,
              fill: false,
              borderColor: 'rgba(0, 132, 148, 1)',
              backgroundColor: 'rgba(0, 132, 148, 0.2)',
              tension: 0.2,
              borderWidth: 5,
              pointRadius: 3,
            },
          ],
        },
        options: {
          scales: {
            x: {
              title: {
                display: true,
                text: 'Date',
                font: { size: 18, weight: 'bold' }, // bigger x-axis title
              },
              ticks: {
                color: 'rgba(128,128,128,0.8)', // lighter x-axis numbers
                font: { size: 16, weight: 'bold' }, // bigger font for numbers
              },
            },
            y: {
              title: {
                display: true,
                text:
                  mode === 'cumulative' ? 'Cumulative Kills' : 'Average K/D',
                font: { size: 18, weight: 'bold' }, // bigger y-axis title
              },
              ticks: {
                color: 'rgba(128,128,128,0.8)', // lighter y-axis numbers
                font: { size: 16, weight: 'bold' }, // bigger font for numbers
              },
              beginAtZero: true,
            },
          },
          plugins: {
            title: {
              display: false,
            },
          },
        },
      };

      const image = await chartJSNodeCanvas.renderToBuffer(configuration);

      const clanTag = dailyRows[0]?.recent_clan_tag;
      const name = dailyRows[0]?.recent_name;
      const string = `${mode === 'cumulative' ? 'Cumulative kills' : 'Average K/D'} graph for ${clanTag || ''} ${name || 'Unknown'} (${gid})`;
      if (selectInteraction.deferred || selectInteraction.replied) {
        await selectInteraction.editReply({
          content: string,
          files: [{ attachment: image, name: 'graph.png' }],
          components: [],
        });
      } else {
        await selectInteraction.update({
          content: string,
          files: [{ attachment: image, name: 'graph.png' }],
          components: [],
        });
      }
    });

    collector.on('end', async () => {
      await interaction.editReply({ components: [] });
    });
  } catch (err) {
    console.error('Ships graph command error:', err);
    return interaction.editReply('❌ Something went wrong fetching the graph.');
  }
}
