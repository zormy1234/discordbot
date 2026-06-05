import { PermissionFlagsBits, SlashCommandBuilder, } from 'discord.js';
import { enqueuePrivateDb } from '../database/dbQueue.js';
import { connection as db } from '../database/SharedConnect.js';
export const data = new SlashCommandBuilder()
    .setName('redcoats-link')
    .setDescription('Link a Discord user to a gid')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option => option
    .setName('user')
    .setDescription('Discord user')
    .setRequired(true))
    .addStringOption(option => option
    .setName('gid')
    .setDescription('Game ID')
    .setRequired(true));
export async function execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const gid = interaction.options.getString('gid', true);
    await enqueuePrivateDb('redcoats-link', async () => {
        await db.execute(`
            INSERT INTO redcoats_discord_links (
              discord_user_id,
              gid,
              linked_by
            )
            VALUES (?, ?, ?)
            ON CONFLICT (discord_user_id)
            DO UPDATE SET gid = excluded.gid
          `, [
            user.id,
            gid,
            interaction.user.id,
        ]);
        await interaction.reply({
            content: `Linked ${user.username} → ${gid}`,
            ephemeral: true,
        });
    });
}
