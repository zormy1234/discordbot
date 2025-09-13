import { SlashCommandBuilder, } from 'discord.js';
import connection from '../database/connect.js';
export const data = new SlashCommandBuilder()
    .setName('set_tanks_winlogs')
    .setDescription('Update the winlog channel and clan tag (requires mod role)')
    .addChannelOption((option) => option
    .setName('winlog')
    .setDescription('Set the winlog channel')
    .setRequired(true))
    .addStringOption((option) => option
    .setName('clan_tag')
    .setDescription('Set the clan tag')
    .setRequired(true));
export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    try {
        const guildId = interaction.guild?.id;
        const userId = interaction.user.id;
        if (!guildId) {
            await interaction.editReply('❌ This command can only be used in a guild.');
            return;
        }
        // Get stored setup for this guild
        const [rows] = (await connection.execute('SELECT * FROM clan_discord_details WHERE guild_id = ?', [guildId]));
        const setup = rows[0];
        if (!setup) {
            await interaction.editReply({
                content: '⚠️ You must run `/setup` first.',
                flags: '64',
            });
            return;
        }
        // Check if user has the mod role
        const member = await interaction.guild.members.fetch(userId);
        if (!member.roles.cache.some((role) => role.id === setup.mod_role_id)) {
            await interaction.editReply({
                content: '⚠️ You must have the mod role to run this command.',
                flags: '64',
            });
            return;
        }
        // Get required options
        const winlogChannel = interaction.options.getChannel('winlog');
        const clanTag = interaction.options.getString('clan_tag', true);
        // Update the database
        await connection.execute(`UPDATE clan_discord_details
       SET tanks_winlog_channel_id = ?,
           tanks_clan_tag = ?
       WHERE guild_id = ?`, [winlogChannel.id, clanTag, guildId]);
        await interaction.editReply({
            content: `✅ Settings updated.\n` +
                `New Winlog channel: <#${winlogChannel.id}>\n` +
                `New Clan Tag: ${clanTag}`,
        });
    }
    catch (err) {
        console.error('Set winlogs error:', err);
        await interaction.editReply('❌ Something went wrong while updating settings.');
    }
}
