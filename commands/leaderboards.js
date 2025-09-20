import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, } from 'discord.js';
import connection from '../database/connect.js';
export const data = new SlashCommandBuilder()
    .setName('tanks_leaderboard')
    .setDescription('Show top 50 players by highest score, kills, K/D, or avg K/D')
    .addStringOption((option) => option
    .setName('type')
    .setDescription('Leaderboard type')
    .setRequired(true)
    .addChoices({ name: 'Highest Score', value: 'highest_score' }, { name: 'Highest Kills', value: 'highest_kills' }, { name: 'Highest K/D', value: 'highest_kd' }, { name: 'Average K/D', value: 'avg_kd' }));
const typeNames = {
    highest_score: 'Highest Score',
    highest_kills: 'Highest Kills',
    highest_kd: 'Highest K/D',
    avg_kd: 'Average K/D (min 2 games played)',
};
export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    try {
        const type = interaction.options.getString('type', true);
        // Change this query to include a WHERE clause only for avg_kd
        const [rows] = (await connection.execute(type === 'avg_kd'
            ? `SELECT gid, recent_name, recent_clan_tag, avg_kd, num_entries
         FROM tanks_totals
         WHERE num_entries >= 2
         ORDER BY avg_kd DESC
         LIMIT 50`
            : `SELECT gid, recent_name, recent_clan_tag, highest_score, highest_kills, highest_kd
         FROM tanks_totals
         ORDER BY ${type} DESC
         LIMIT 50`));
        if (!rows.length)
            return interaction.editReply('❌ No data found.');
        // Prepare pages
        const pages = [];
        for (let i = 0; i < rows.length; i += 10) {
            const pageRows = rows.slice(i, i + 10);
            let description = '';
            pageRows.forEach((r, idx) => {
                const value = (() => {
                    switch (type) {
                        case 'highest_score':
                            return Number(r.highest_score).toLocaleString();
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
            });
            const embed = new EmbedBuilder()
                .setTitle(`Leaderboard — ${typeNames[type]}`)
                .setDescription(description)
                .setColor(0x008494)
                .setFooter({
                text: `Page ${Math.floor(i / 10) + 1}/${Math.ceil(rows.length / 10)}`,
            });
            pages.push(embed);
        }
        let currentPage = 0;
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('⬅️ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true), new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(pages.length <= 1));
        const message = await interaction.editReply({
            embeds: [pages[currentPage]],
            components: [row],
        });
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60 * 1000,
        });
        collector.on('collect', async (btn) => {
            if (!btn.isButton())
                return;
            if (btn.user.id !== interaction.user.id) {
                return btn.reply({
                    content: 'You cannot control this leaderboard.',
                    ephemeral: true,
                });
            }
            if (btn.customId === 'prev')
                currentPage--;
            if (btn.customId === 'next')
                currentPage++;
            const newRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 0), new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === pages.length - 1));
            await btn.update({ embeds: [pages[currentPage]], components: [newRow] });
        });
        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true), new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true));
            await interaction.editReply({ components: [disabledRow] });
        });
    }
    catch (err) {
        console.error('Leaderboard command error:', err);
        return interaction.editReply('❌ Failed to fetch leaderboard.');
    }
}
