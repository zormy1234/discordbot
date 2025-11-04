import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } from 'discord.js';
import connection from '../database/connect.js';
export const data = new SlashCommandBuilder()
    .setName('find_tanks_player')
    .setDescription('Find players by name (and optional clan tag)')
    .addStringOption(option => option.setName('name')
    .setDescription('Player name to search for')
    .setRequired(true))
    .addStringOption(option => option.setName('clan')
    .setDescription('Optional clan tag to filter by')
    .setRequired(false));
export async function execute(interaction) {
    await interaction.deferReply();
    const name = interaction.options.getString('name', true);
    const clan = interaction.options.getString('clan') ?? null;
    if (name.length < 2) {
        return interaction.editReply('❌ Please enter a name longer than 1 character.');
    }
    const PAGE_SIZE = 5;
    const MAX_PAGES = 5;
    let page = 0;
    async function fetchPage(page) {
        const offset = page * PAGE_SIZE;
        const query = `
        SELECT gid, recent_name, recent_clan_tag, total_score
        FROM tanks_totals
        WHERE recent_name LIKE ?
        ${clan ? 'AND recent_clan_tag = ?' : ''}
        ORDER BY total_score DESC
        LIMIT ? OFFSET ?
      `;
        const params = clan
            ? [`%${name}%`, clan, PAGE_SIZE, offset]
            : [`%${name}%`, PAGE_SIZE, offset];
        const [rows] = await connection.execute(query, params);
        return rows;
    }
    async function buildContent(page) {
        const results = await fetchPage(page);
        if (results.length === 0) {
            return `❌ No tanks3d player found for **${name}**${clan ? ` in clan ${clan}` : ''}.`;
        }
        const lines = results.map(r => {
            const scoreStr = r.total_score.toLocaleString();
            const clanStr = r.recent_clan_tag && r.recent_clan_tag.trim() !== ''
                ? `Clan: ${r.recent_clan_tag} | `
                : '';
            return `** GID: \`${r.gid}\`**\n ${clanStr}${r.recent_name} → Total Score: ${scoreStr}\n`;
        });
        return `Results for **${name}**${clan ? ` (Clan: ${clan})` : ''}\n${lines.join('\n')}\n\nPage ${page + 1}/${MAX_PAGES}`;
    }
    const content = await buildContent(page);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('prev').setLabel('⬅️ Previous').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('next').setLabel('➡️ Next').setStyle(ButtonStyle.Secondary));
    const reply = await interaction.editReply({ content, components: [row] });
    const collector = reply.createMessageComponentCollector({ time: 60_000 });
    collector.on('collect', async (i) => {
        if (i.customId === 'prev' && page > 0)
            page--;
        if (i.customId === 'next' && page < MAX_PAGES - 1)
            page++;
        const newContent = await buildContent(page);
        await i.update({ content: newContent, components: [row] });
    });
    collector.on('end', async () => {
        await interaction.editReply({ components: [] });
    });
}
