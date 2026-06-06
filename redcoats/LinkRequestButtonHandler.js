import { RedcoatsRepository } from './RedcoatsRepository.js';
export class LinkRequestButtonHandler {
    static async handle(interaction) {
        if (!interaction.customId.startsWith('rc_link_')) {
            return;
        }
        const [action, requestIdString] = interaction.customId.split(':');
        const requestId = Number(requestIdString);
        const request = await RedcoatsRepository
            .getPendingRequest(requestId);
        if (!request) {
            return interaction.reply({
                content: 'Request already processed.',
                ephemeral: true
            });
        }
        if (action ===
            'rc_link_approve') {
            const approved = await RedcoatsRepository
                .approveRequest(requestId, interaction.user.id);
            if (!approved) {
                return interaction.reply({
                    content: 'Already processed.',
                    ephemeral: true
                });
            }
            await RedcoatsRepository
                .createDiscordLink(request.discord_user_id, request.gid, interaction.user.id);
            const channel = await interaction.client.channels.fetch(request.request_channel_id);
            if (channel &&
                channel.isTextBased() &&
                channel.isSendable()) {
                await channel.send(`✅ <@${request.discord_user_id}> has been linked to GID **${request.gid}**`);
            }
            return interaction.update({
                content: `✅ Approved by ${interaction.user.tag}`,
                embeds: interaction.message.embeds,
                components: []
            });
        }
        if (action ===
            'rc_link_reject') {
            const rejected = await RedcoatsRepository
                .rejectRequest(requestId, interaction.user.id);
            if (!rejected) {
                return interaction.reply({
                    content: 'Already processed.',
                    ephemeral: true
                });
            }
            const channel = await interaction.client.channels.fetch(request.request_channel_id);
            if (channel &&
                channel.isTextBased() &&
                channel.isSendable()) {
                await (channel).send({
                    content: `❌ <@${request.discord_user_id}> link request for **${request.gid}** was rejected`
                });
            }
            return interaction.update({
                content: `❌ Rejected by ${interaction.user.tag}`,
                embeds: interaction.message.embeds,
                components: []
            });
        }
    }
}
