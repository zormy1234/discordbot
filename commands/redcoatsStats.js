import { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, AttachmentBuilder, ComponentType, EmbedBuilder, } from 'discord.js';
import connection from '../database/connect.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
const chartCanvas = new ChartJSNodeCanvas({
    width: 1200,
    height: 600,
});
export const data = new SlashCommandBuilder()
    .setName('redcoats')
    .setDescription('Redcoats commands')
    .addSubcommand((sub) => sub
    .setName('stats')
    .setDescription('Get player stats')
    .addStringOption((o) => o.setName('name').setDescription('Player name').setRequired(true))
    .addStringOption((o) => o.setName('clan').setDescription('Clan').setRequired(false)))
    // .addSubcommand((sub) =>
    //   sub
    //     .setName('leaderboard')
    //     .setDescription('Leaderboard')
    //     .addStringOption((o) =>
    //       o
    //         .setName('metric')
    //         .setDescription('Metric')
    //         .addChoices(
    //           { name: 'Total Player Kills', value: 'total_player_kills' },
    //           { name: 'Highest Score', value: 'highest_score' },
    //           { name: 'Average KD', value: 'average_kd' },
    //           { name: 'Best Single Game KD', value: 'best_single_game_kd' }
    //         )
    //     )
    //     .addBooleanOption((o) =>
    //       o.setName('alltime').setDescription('Use all time stats')
    //     )
    // )
    .addSubcommand((sub) => sub
    .setName('graph')
    .setDescription('Player graph')
    .addStringOption((o) => o.setName('name').setDescription('Player name').setRequired(true))
    .addStringOption((o) => o
    .setName('metric')
    .setDescription('Metric')
    .setRequired(true)
    .addChoices({ name: 'Kills', value: 'total_kills' }, { name: 'KD Ratio', value: 'average_kd' }))
    .addIntegerOption((o) => o
    .setName('months')
    .setDescription('How many months of data (leave empty for all time)')
    .setRequired(false)));
export async function execute(interaction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();
    try {
        // =========================
        // STATS
        // =========================
        if (sub === 'stats') {
            const name = interaction.options.getString('name', true);
            const clan = interaction.options.getString('clan');
            const [rows] = await connection.execute(`
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
        `, clan ? [`%${name}%`, clan] : [`%${name}%`]);
            if (!rows.length) {
                return interaction.editReply(`❌ No Redcoats players found for **${name}**${clan ? ` in clan ${clan}` : ''}`);
            }
            const options = rows.map((r) => ({
                label: `${r.latest_username} ${r.latest_clan ? `[${r.latest_clan}]` : ''}`,
                description: `Kills: ${r.total_player_kills} | Games: ${r.total_games}`,
                value: r.gid.toString(),
            }));
            const menu = new StringSelectMenuBuilder()
                .setCustomId('redcoats_stats_select')
                .setPlaceholder('Select a player')
                .addOptions(options);
            const row = new ActionRowBuilder().addComponents(menu);
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
                const [statsRows] = await connection.execute(`
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
          WHERE gid = ?
          `, [gid]);
                if (!statsRows.length) {
                    return i.update({
                        content: '❌ No stats found for this player.',
                        components: [],
                    });
                }
                const s = statsRows[0];
                const avgKd = Number(s.average_kd ?? 0);
                const bestKd = Number(s.best_single_game_kd ?? 0);
                const embed = new EmbedBuilder()
                    .setTitle(`Redcoats Stats for ${s.latest_clan || ''} ${s.latest_username} (${gid})`)
                    .setColor(0x0099ff)
                    .addFields({
                    name: 'Total Player Kills',
                    value: `${s.total_player_kills?.toLocaleString?.() || 'N/A'}`,
                    inline: false,
                }, {
                    name: 'Total Bot Kills',
                    value: `${s.total_kills?.toLocaleString?.() || 'N/A'}`,
                    inline: false,
                }, {
                    name: 'Average Player K/D',
                    value: avgKd.toFixed(2),
                    inline: false,
                }, {
                    name: 'Best Single Game K/D',
                    value: bestKd.toFixed(2),
                    inline: false,
                });
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
            const metric = interaction.options.getString('metric') || 'total_player_kills';
            const alltime = interaction.options.getBoolean('alltime') ?? false;
            const [rows] = await connection.execute(`
        SELECT latest_username, latest_clan, total_games, ${metric}
        FROM redcoats_player_stats
        WHERE total_games >= 5
        ${alltime ? '' : 'AND last_seen >= NOW() - INTERVAL 2 MONTH'}
        ORDER BY ${metric} DESC
        LIMIT 50
        `);
            if (!rows.length) {
                return interaction.editReply('No leaderboard data');
            }
            const text = rows
                .map((x, i) => `${i + 1}. ${x.latest_username} [${x.latest_clan || 'No Clan'}] - ${Number(x[metric]).toFixed(2)} (games=${x.total_games})`)
                .join('\n');
            return interaction.editReply(`# Leaderboard\n\n${text}`);
        }
        // =========================
        // GRAPH
        // =========================
        if (sub === 'graph') {
            const name = interaction.options.getString('name', true);
            const metric = interaction.options.getString('metric', true);
            const isKD = metric === 'average_kd';
            const isKills = metric === 'total_kills';
            const mode = isKD ? 'kd' : 'kills';
            const [rows] = await connection.execute(`
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
        `, [`%${name}%`]);
            if (!rows.length) {
                return interaction.editReply(`❌ No Redcoats players found for **${name}**`);
            }
            const options = rows.map((r) => ({
                label: `${r.latest_username} ${r.latest_clan ? `[${r.latest_clan}]` : ''}`,
                description: `Kills: ${r.total_player_kills} | Games: ${r.total_games}`,
                value: r.gid.toString(),
            }));
            const menu = new StringSelectMenuBuilder()
                .setCustomId('redcoats_graph_select')
                .setPlaceholder('Select a player for graph')
                .addOptions(options);
            const row = new ActionRowBuilder().addComponents(menu);
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
                const [statsRows] = await connection.execute(`
            SELECT *
            FROM redcoats_daily_stats
            WHERE gid = ?
            ${months ? 'AND stat_date >= NOW() - INTERVAL ? MONTH' : ''}
            ORDER BY stat_date ASC
            `, months ? [gid, months] : [gid]);
                if (!statsRows.length) {
                    return i.update({
                        content: '❌ No graph data found for this player.',
                        components: [],
                    });
                }
                const MAX_POINTS = 80;
                const n = statsRows.length;
                const labels = [];
                const kdData = [];
                const cumulativeBotKills = [];
                const cumulativePlayerKills = [];
                let botSum = 0;
                let playerSum = 0;
                if (n <= MAX_POINTS) {
                    for (const r of statsRows) {
                        labels.push(new Date(r.stat_date).toLocaleDateString());
                        if (mode === 'kd') {
                            kdData.push(Number(r.average_kd ?? 0));
                        }
                        else {
                            botSum += Number(r.total_kills ?? 0);
                            playerSum += Number(r.total_player_kills ?? 0);
                            cumulativeBotKills.push(botSum);
                            cumulativePlayerKills.push(playerSum);
                        }
                    }
                }
                else {
                    const groupSize = Math.ceil(n / MAX_POINTS);
                    for (let i = 0; i < n; i += groupSize) {
                        const group = statsRows.slice(i, i + groupSize);
                        const last = group[group.length - 1];
                        labels.push(new Date(last.stat_date).toLocaleDateString());
                        if (mode === 'kd') {
                            const avgKd = group.reduce((sum, r) => sum + Number(r.average_kd ?? 0), 0) /
                                group.length;
                            kdData.push(avgKd);
                        }
                        else {
                            for (const r of group) {
                                botSum += Number(r.total_kills ?? 0);
                                playerSum += Number(r.total_player_kills ?? 0);
                            }
                            cumulativeBotKills.push(botSum);
                            cumulativePlayerKills.push(playerSum);
                        }
                    }
                }
                const configuration = {
                    type: 'line',
                    data: {
                        labels,
                        datasets: mode === 'kd'
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
                                    font: { size: 18, weight: 'bold' },
                                },
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: mode === 'kd' ? 'K/D Ratio' : 'Cumulative Kills',
                                    font: { size: 18, weight: 'bold' },
                                },
                                beginAtZero: true,
                            },
                        },
                    },
                };
                const image = await chartCanvas.renderToBuffer(configuration);
                return i.update({
                    content: `📈 Graph for **${rows.find((r) => r.gid == gid)?.latest_username || 'Player'}**`,
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
    }
    catch (err) {
        console.error('redcoats command error:', err);
        return interaction.editReply('❌ Something went wrong.');
    }
}
