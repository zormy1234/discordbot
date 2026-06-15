import { PermissionFlagsBits, SlashCommandBuilder, } from 'discord.js';
import connection from '../database/connect.js';
export const data = new SlashCommandBuilder()
    .setName('rcadmin')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDescription('admin stuff')
    .addSubcommand((sub) => sub
    .setName('roles')
    .setDescription('Assign stat-based roles to linked players')
    .addStringOption((option) => option
    .setName('stat')
    .setDescription('Stat to check')
    .setRequired(true)
    .addChoices({ name: 'Average KD', value: 'average_kd' }, { name: 'Player Kills', value: 'total_player_kills' }, { name: 'Bot Kills', value: 'total_kills' }))
    .addNumberOption((option) => option
    .setName('threshold')
    .setMinValue(0)
    .setDescription('Required value')
    .setRequired(true))
    .addRoleOption((option) => option.setName('role').setDescription('Role to award').setRequired(true)))
    .addSubcommand((sub) => sub.setName('sync').setDescription('Sync roles'));
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    try {
        if (sub === 'roles') {
            const stat = interaction.options.getString('stat', true);
            const threshold = interaction.options.getNumber('threshold', true);
            const role = interaction.options.getRole('role', true);
            await connection.execute(`
        INSERT INTO redcoats_role_rules
        (
          guild_id,
          discord_role_id,
          stat_type,
          threshold,
          created_by
        )
        VALUES (?, ?, ?, ?, ?)
        `, [interaction.guildId, role.id, stat, threshold, interaction.user.id]);
            await interaction.reply({
                content: `Created rule: ${role} for ${stat} >= ${threshold}`,
                ephemeral: true,
            });
            return;
        }
        //
        // SYNC
        //
        if (sub === 'sync') {
            await interaction.deferReply({
                ephemeral: true,
            });
            const guild = interaction.guild;
            if (!guild) {
                return interaction.editReply('Guild not found.');
            }
            //
            // Fetch all members ONCE instead of one API call per member.
            //
            await guild.members.fetch();
            const [rules] = await connection.query(`
        SELECT *
        FROM redcoats_role_rules
        WHERE guild_id = ?
        `, [guild.id]);
            const [rows] = await connection.query(`
        SELECT
          l.discord_user_id,

          s.average_kd,
          s.total_player_kills,
          s.total_kills

        FROM redcoats_discord_links l

        JOIN redcoats_player_stats s
          ON s.gid = l.gid
        `);
            let changedMembers = 0;
            let scannedMembers = 0;
            for (const row of rows) {
                scannedMembers++;
                const member = guild.members.cache.get(row.discord_user_id);
                if (!member) {
                    continue;
                }
                //
                // Start with current roles.
                //
                const desiredRoles = new Set(member.roles.cache.map((r) => r.id));
                //
                // Apply all Redcoats rules.
                //
                for (const rule of rules) {
                    const statValue = Number(row[rule.stat_type] ?? 0);
                    const qualifies = statValue >= Number(rule.threshold);
                    if (qualifies) {
                        desiredRoles.add(rule.discord_role_id);
                    }
                    else {
                        desiredRoles.delete(rule.discord_role_id);
                    }
                }
                const currentRoles = member.roles.cache.map((r) => r.id);
                const desiredArray = [...desiredRoles];
                const changed = currentRoles.length !== desiredArray.length ||
                    currentRoles.some((id) => !desiredRoles.has(id));
                if (!changed) {
                    continue;
                }
                changedMembers++;
                //
                // One API request instead of multiple
                // add/remove calls.
                //
                await member.roles.set(desiredArray);
                //
                // Small pause to avoid hammering Discord.
                //
                await sleep(100);
            }
            await interaction.editReply(`✅ Sync complete.\n` +
                `Scanned: ${scannedMembers}\n` +
                `Updated: ${changedMembers}`);
            return;
        }
    }
    catch (err) {
        console.error('redcoats admin command error:', err);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply('❌ Something went wrong.');
        }
        else {
            await interaction.reply({
                content: '❌ Something went wrong.',
                ephemeral: true,
            });
        }
    }
}
