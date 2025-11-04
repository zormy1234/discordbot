import { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder, ComponentType, } from 'discord.js';
import connection from '../database/connect.js';
export const data = new SlashCommandBuilder()
    .setName('tanks_total_stats')
    .setDescription('Find a Tanks3D player and view their total stats')
    .addStringOption((option) => option
    .setName('name')
    .setDescription('Player name to search for')
    .setRequired(true))
    .addStringOption((option) => option
    .setName('clan')
    .setDescription('Optional clan tag to filter by')
    .setRequired(false));
export async function execute(interaction) {
    await interaction.deferReply();
    const name = interaction.options.getString('name', true);
    const clan = interaction.options.getString('clan') ?? null;
    if (name.length < 2) {
        return interaction.editReply('❌ Please enter a name longer than 1 character.');
    }
    try {
        // Step 1: Lookup matching players
        const [rows] = await connection.execute(`
      SELECT gid, recent_name, recent_clan_tag, total_score
      FROM tanks_totals
      WHERE recent_name LIKE ?
      ${clan ? 'AND recent_clan_tag = ?' : ''}
      ORDER BY total_score DESC
      LIMIT 5
      `, clan ? [`%${name}%`, clan] : [`%${name}%`]);
        if (!rows.length) {
            return interaction.editReply(`❌ No players found for **${name}**${clan ? ` in clan ${clan}` : ''}.`);
        }
        // Step 2: Build select menu
        const options = rows.map((r) => ({
            label: `${r.recent_name} ${r.recent_clan_tag ? `[${r.recent_clan_tag}]` : ''}`,
            description: `Score: ${r.total_score.toLocaleString()} | GID: ${r.gid}`,
            value: r.gid.toString(),
        }));
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_gid_total')
            .setPlaceholder('Select a player to view total stats')
            .addOptions(options);
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.editReply({
            content: `Found ${rows.length} matching player(s) for **${name}**:`,
            components: [row],
        });
        // Step 3: Wait for user selection
        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000,
        });
        collector.on('collect', async (selectInteraction) => {
            if (selectInteraction.user.id !== interaction.user.id) {
                return selectInteraction.reply({
                    content: 'You can’t use this selection — it’s not your lookup.',
                    ephemeral: true,
                });
            }
            const gid = selectInteraction.values[0];
            // Step 4: Fetch total stats
            const [statsRows] = await connection.execute(`
        SELECT 
            total_kills, 
            total_deaths, 
            total_score, 
            number_top5, 
            number_top20, 
            recent_name, 
            recent_clan_tag
        FROM tanks_totals 
        WHERE gid = ?
        `, [gid]);
            if (!statsRows.length) {
                return selectInteraction.update({
                    content: `❌ No data found for GID \`${gid}\`.`,
                    components: [],
                });
            }
            const stats = statsRows[0];
            const kd = stats.total_deaths > 0
                ? (stats.total_kills / stats.total_deaths).toFixed(2)
                : '∞';
            const embed = new EmbedBuilder()
                .setTitle(`📊 Total Stats for ${stats.recent_clan_tag || ''} ${stats.recent_name || 'Unknown'} (${gid})`)
                .setColor(0x00ff00)
                .addFields({
                name: 'Total Score',
                value: Number(stats.total_score).toLocaleString(),
                inline: false,
            }, {
                name: 'Total Kills',
                value: Number(stats.total_kills).toLocaleString(),
                inline: false,
            }, {
                name: 'Total Deaths',
                value: Number(stats.total_deaths).toLocaleString(),
                inline: false,
            }, {
                name: 'Total K/D Ratio',
                value: kd,
                inline: false,
            }, {
                name: 'Top 5 Finishes',
                value: Number(stats.number_top5).toLocaleString(),
                inline: false,
            }, {
                name: 'Top 20 Finishes',
                value: Number(stats.number_top20).toLocaleString(),
                inline: false,
            })
                .setTimestamp();
            await selectInteraction.update({
                content: `📈 Showing total stats for GID \`${gid}\`:`,
                embeds: [embed],
                components: [],
            });
        });
        collector.on('end', async () => {
            await interaction.editReply({ components: [] });
        });
    }
    catch (err) {
        console.error('Total stats command error:', err);
        return interaction.editReply({
            content: '❌ Something went wrong fetching stats for this player.',
        });
    }
}
