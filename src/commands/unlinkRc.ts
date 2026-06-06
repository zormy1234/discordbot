import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
} from 'discord.js';
import { RedcoatsRepository } from '../redcoats/RedcoatsRepository.js';

export const data = new SlashCommandBuilder()
  .setName('unlink-rc')
  .setDescription('Remove a Redcoats link from a Discord user')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Discord user to unlink')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true,
    });
  }

  const user = interaction.options.getUser('user', true);

  const existingLink = await RedcoatsRepository.getDiscordLink(user.id);

  if (!existingLink) {
    return interaction.reply({
      content: `${user.tag} does not have a linked Redcoats account.`,
      ephemeral: true,
    });
  }

  await RedcoatsRepository.removeDiscordLink(user.id);

  await interaction.reply({
    content:
      `✅ Removed link for ${user.tag}\n` +
      `Previous GID: **${existingLink.gid}**`,
  });
}
