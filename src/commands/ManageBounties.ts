// commands/bounty.js
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import {
  cancelBounty,
  completeBounty,
  createBounty,
  listOpenBounties,
  showLeaderboard,
  showUserBounties,
} from '../utils/BountyLogic.js';

import { RowDataPacket } from 'mysql2';
import connection from '../database/connect.js';

export const data = new SlashCommandBuilder()
  .setName('bounty')
  .setDescription('Manage player bounties')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Create a bounty for a player')
      .addStringOption((opt) =>
        opt
          .setName('player')
          .setDescription('Player name to place a bounty on')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('reason')
          .setDescription('Reason for placing the bounty')
          .setMaxLength(200)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('complete')
      .setDescription('Mark a bounty as complete')
      .addUserOption((opt) =>
        opt
          .setName('winner')
          .setDescription('The user who completed the bounty')
      )
      .addStringOption((opt) =>
        opt
          .setName('non_discord_winner')
          .setDescription('Use this field if the winner is not in discord')
      )
      .addStringOption((opt) =>
        opt
          .setName('bounty_id')
          .setDescription('The bounty ID to complete')
      )
  )
//   .addSubcommand((sub) =>
//     sub
//       .setName('cancel')
//       .setDescription('Cancel a bounty')
//       .addStringOption((opt) =>
//         opt
//           .setName('bounty_id')
//           .setDescription('The bounty ID to cancel')
//           .setRequired(true)
//       )
//   )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('List all active bounties')
  );
//   .addSubcommand((sub) =>
//     sub.setName('leaderboard').setDescription('Show the gold leaderboard')
//   )
//   .addSubcommand((sub) =>
//     sub
//       .setName('user')
//       .setDescription('Show all bounties completed by a user')
//       .addUserOption((opt) =>
//         opt.setName('user').setDescription('User to check').setRequired(true)
//       )
//   );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'create': {
      return createBounty(interaction);
    }

    case 'complete': {
      return completeBounty(interaction);
    }

    // case 'cancel': {
    //   const bountyId = interaction.options.getString('bounty_id', true);
    //   return cancelBounty(interaction, bountyId);
    // }

    case 'list':
      return listOpenBounties(interaction);

    // case 'leaderboard':
    //   return showLeaderboard(interaction);

    // case 'user': {
    //   const user = interaction.options.getUser('user', true);
    //   return showUserBounties(interaction, user);
    // }

    default:
      return interaction.reply({
        content: '❌ Unknown subcommand.',
        ephemeral: true,
      });
  }
}

async function checkBountySetterRole(guildId: string | null, member: any) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT role_id FROM bounty_roles WHERE guild_id = ?',
    [guildId]
  );

  if ((rows as RowDataPacket[]).length === 0) return false;

  const roleId = (rows as RowDataPacket[])[0].role_id;
  return member.roles.cache.has(roleId);
}
