import { SlashCommandBuilder, EmbedBuilder, } from 'discord.js';
import connection from '../database/connect.js';
export const data = new SlashCommandBuilder()
    .setName('tanks_highest_stats')
    .setDescription('Get highest stats for a given GID')
    .addStringOption((option) => option.setName('gid').setDescription('The GID to look up').setRequired(true));
export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    try {
        const gid = interaction.options.getString('gid', true);
        const [rows] = (await connection.execute(`SELECT 
          highest_score, 
          highest_kills, 
          highest_deaths, 
          highest_kd, 
          recent_name, 
          recent_clan_tag
       FROM tanks_totals 
       WHERE gid = ?`, [gid]));
        if (!rows.length) {
            return interaction.editReply({
                content: `❌ No data found for GID \`${gid}\`.`,
            });
        }
        const stats = rows[0];
        const embed = new EmbedBuilder()
            .setTitle(`🏆 Highest Stats for ${stats.recent_clan_tag || ''} ${stats.recent_name || 'Unknown'} (${gid}) for a single game`)
            .setColor(0xffd700) // gold color for "highest"
            .addFields({
            name: 'Highest Score',
            value: Number(stats.highest_score).toLocaleString(),
            inline: false,
        }, {
            name: 'Highest Kills',
            value: Number(stats.highest_kills).toLocaleString(),
            inline: false,
        }, {
            name: 'Highest Deaths',
            value: Number(stats.highest_deaths).toLocaleString(),
            inline: false,
        }, {
            name: 'Highest K/D Ratio',
            value: stats.highest_kd && stats.highest_kd > 0
                ? stats.highest_kd.toFixed(2)
                : 'N/A',
            inline: false,
        })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }
    catch (err) {
        console.error('Highest stats command error:', err);
        return interaction.editReply({
            content: '❌ Something went wrong fetching highest stats for this GID.',
        });
    }
}
