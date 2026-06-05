import {
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';

  import { enqueuePrivateDb } from '../database/dbQueue.js';
import { connection as db } from '../database/SharedConnect.js';
  
  export const data = new SlashCommandBuilder()
    .setName('redcoats-assignroles')
    .setDescription('Assign stat-based roles to linked players')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator,
    );
  
  export async function execute(
    interaction: ChatInputCommandInteraction,
  ) {
    await interaction.deferReply({ ephemeral: true });
  
    await enqueuePrivateDb(
      'redcoats-assignroles',
      async () => {
        const links = await db.execute(
          `
            SELECT discord_user_id, gid
            FROM redcoats_discord_links
          `,
          [],
        ) as any[];
  
        const rules = await db.execute(
          `
            SELECT *
            FROM redcoats_role_rules
            WHERE guild_id = ?
          `,
          [interaction.guildId],
        ) as any[];
  
        if (!rules.length) {
          await interaction.editReply(
            'No role rules configured',
          );
          return;
        }
  
        let updated = 0;
  
        for (const link of links) {
          const member =
            await interaction.guild?.members.fetch(
              link.discord_user_id,
            ).catch(() => null);
  
          if (!member) continue;
  
          const statsRows = await db.execute(
            `
              SELECT *
              FROM redcoats_player_stats
              WHERE gid = ?
            `,
            [link.gid],
          ) as any[];
  
          if (!statsRows.length) continue;
  
          const stats = statsRows[0];
  
          for (const rule of rules) {
            let value = 0;
  
            switch (rule.stat_type) {
              case 'TOTAL_PLAYER_KILLS':
                value = stats.total_player_kills;
                break;
  
              case 'AVERAGE_KD':
                value = stats.average_kd;
                break;
  
              case 'BEST_SINGLE_GAME_KD':
                value = stats.best_single_game_kd;
                break;
            }
  
            if (value >= rule.threshold) {
              await member.roles.add(
                rule.discord_role_id,
              ).catch(() => {});
            }
          }
  
          updated++;
        }
  
        await interaction.editReply(
          `Processed ${updated} users`,
        );
      },
    );
  }