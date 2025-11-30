import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, } from 'discord.js';
import connection from '../database/connect.js';
export const data = new SlashCommandBuilder()
    .setName('ships_leaderboard')
    .setDescription('Show top 50 players by kills, K/D, avg K/D')
    .addStringOption((option) => option
    .setName('type')
    .setDescription('Leaderboard type')
    .setRequired(true)
    .addChoices({ name: 'Highest Kills', value: 'highest_kills' }, { name: 'Highest K/D', value: 'highest_kd' }, { name: 'Average K/D', value: 'avg_kd' }, { name: 'Total K/D (full KD)', value: 'full_avg_kd' }))
    .addIntegerOption((option) => option
    .setName('days')
    .setDescription('Show data from the last N days (optional)')
    .setRequired(false)
    .setMinValue(1)
    .setMaxValue(60))
    .addIntegerOption((option) => option
    .setName('min_kills')
    .setDescription('Minimum total kills required for Avg K/D leaderboard')
    .setRequired(false)
    .setMinValue(0))
    .addStringOption((option) => option
    .setName('clan')
    .setDescription('Filter leaderboard by clan tag (optional)')
    .setRequired(false));
const typeNames = {
    highest_kills: 'Highest Kills',
    highest_kd: 'Highest K/D',
    avg_kd: 'Average K/D (min 5 games played)',
    full_avg_kd: 'Total K/D (full KD, min 5 games played)',
};
export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    try {
        const type = interaction.options.getString('type', true);
        const clan = interaction.options.getString('clan')?.trim() || null;
        const days = interaction.options.getInteger('days') || null;
        const minKills = interaction.options.getInteger('min_kills') ?? 0;
        // If days is provided, use daily table
        const table = days ? 'ships_daily_totals' : 'ships_totals';
        const params = [];
        // Build base query
        let query = '';
        if (days) {
            if (type === 'avg_kd') {
                query = `
          SELECT 
            gid,
            recent_name,
            recent_clan_tag,
            AVG(avg_kd) AS avg_kd,
            COUNT(*) AS num_entries
          FROM ${table}
          WHERE last_entry >= NOW() - INTERVAL ? DAY
        `;
            }
            else if (type === 'highest_kills') {
                query = `
          SELECT 
            gid,
            recent_name,
            recent_clan_tag,
            MAX(highest_kills) AS highest_kills
          FROM ${table}
          WHERE last_entry >= NOW() - INTERVAL ? DAY
        `;
            }
            else if (type === 'highest_kd') {
                query = `
          SELECT 
            gid,
            recent_name,
            recent_clan_tag,
            MAX(highest_kd) AS highest_kd
          FROM ${table}
          WHERE last_entry >= NOW() - INTERVAL ? DAY
        `;
            }
            else if (type === 'full_avg_kd') {
                query = `
          SELECT
            gid,
            recent_name,
            recent_clan_tag,
            AVG(full_avg_kd) AS full_avg_kd
          FROM ${table}
          WHERE last_entry >= NOW() - INTERVAL ? DAY
        `;
            }
            params.push(days);
            if (clan) {
                query += ` AND recent_clan_tag = ?`;
                params.push(clan);
            }
            // 👇 Add GROUP BY + ORDER BY once
            query += ` GROUP BY gid ORDER BY ${type} DESC LIMIT 50`;
        }
        else {
            // 👇 Existing code for non-daily leaderboards
            if (type === 'avg_kd') {
                query = `
          SELECT gid, recent_name, recent_clan_tag, avg_kd, num_entries
          FROM ${table}
          WHERE num_entries >= 5
          AND total_kills >= ?
          `;
                params.push(minKills);
            }
            else if (type === 'full_avg_kd') {
                query = `
            SELECT gid, recent_name, recent_clan_tag, full_avg_kd
            FROM ${table}
             WHERE num_entries >= 5
            AND total_kills >= ?
          `;
                params.push(minKills);
            }
            else {
                query = `
          SELECT gid, recent_name, recent_clan_tag, highest_kills, highest_kd
          FROM ${table}
          WHERE 1=1
          `;
            }
            if (clan) {
                query += ` AND recent_clan_tag = ?`;
                params.push(clan);
            }
            query += ` ORDER BY ${type} DESC LIMIT 50`;
        }
        // Execute leaderboard query
        const [rows] = (await connection.execute(query, params));
        // Global averages
        let avgQuery = `
      SELECT
        AVG(highest_kills) AS avg_highest_kills,
        AVG(highest_kd) AS avg_highest_kd,
        AVG(avg_kd) AS avg_avg_kd,
        AVG(full_avg_kd) AS avg_full_avg_kd
      FROM ${table}
      WHERE num_entries >= 2
    `;
        const avgParams = [];
        if (days) {
            avgQuery += ` AND last_entry >= NOW() - INTERVAL ? DAY`;
            avgParams.push(days);
        }
        const [avgRows] = (await connection.execute(avgQuery, avgParams));
        const averages = avgRows[0];
        if (!rows.length) {
            return interaction.editReply(clan
                ? `❌ No data found for clan **${clan}**${days ? ` (last ${days} days)` : ''}.`
                : `❌ No data found${days ? ` (last ${days} days)` : ''}.`);
        }
        const pages = [];
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
                        case 'full_avg_kd': // ← NEW
                            return Number(r.full_avg_kd).toFixed(2);
                    }
                })();
                const name = r.recent_clan_tag
                    ? `[${r.recent_clan_tag}] ${r.recent_name}`
                    : r.recent_name;
                description += `${i + idx + 1}. ${name} — ${value}\n`;
            });
            if (type === 'avg_kd') {
                description += `\nGlobal avg K/D (≥2 games): ${Number(averages.avg_avg_kd).toFixed(2)}`;
            }
            else if (type === 'highest_kills') {
                description += `\nGlobal avg highest kills: ${Number(averages.avg_highest_kills).toFixed(0)}`;
            }
            else if (type === 'highest_kd') {
                description += `\nGlobal avg highest K/D: ${Number(averages.avg_highest_kd).toFixed(2)}`;
            }
            else if (type === 'full_avg_kd') {
                description += `\nGlobal avg Total K/D: ${Number(averages.avg_full_avg_kd).toFixed(2)}`;
            }
            const embed = new EmbedBuilder()
                .setTitle(`Leaderboard — ${typeNames[type]}${clan ? ` (Clan: ${clan})` : ''}${days ? ` — Last ${days} Days` : ''}${type === 'avg_kd' && minKills > 0 ? ` — Min Kills: ${minKills}` : ''}`)
                .setDescription(description)
                .setColor(0x008494)
                .setFooter({
                text: `Page ${Math.floor(i / 10) + 1}/${Math.ceil(rows.length / 10)}`,
            });
            pages.push(embed);
        }
        // Pagination controls
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
            if (btn.customId === 'prev') {
                currentPage = currentPage === 0 ? pages.length - 1 : currentPage - 1;
            }
            if (btn.customId === 'next') {
                currentPage = currentPage === pages.length - 1 ? 0 : currentPage + 1;
            }
            const newRow = new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Primary), new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Primary));
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
            // Reset to first page
            await interaction.editReply({
                embeds: [pages[0]],
                components: [disabledRow],
            });
        });
    }
    catch (err) {
        console.error('Leaderboard command error:', err);
        return interaction.editReply('❌ Failed to fetch leaderboard.');
    }
}
