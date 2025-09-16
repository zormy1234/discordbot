import { PermissionFlagsBits, SlashCommandBuilder, } from 'discord.js';
import { connection } from '../database/SharedConnect.js';
import { parseLine } from '../handle_winlogs/ReceiveWinlogs.js';
export const data = new SlashCommandBuilder()
    .setName('backfill')
    .setDescription('DONT RUN THIS')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) => option
    .setName('after')
    .setDescription('Only fetch messages after this message ID')
    .setRequired(false));
export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const channel = interaction.channel;
        if (!channel?.isTextBased()) {
            return interaction.editReply('❌ This command must be run in a text channel.');
        }
        console.log(`Running`);
        const afterMessageId = interaction.options.getString('after') ?? undefined;
        let fetchedMessages = [];
        let lastId = afterMessageId;
        const seen = new Set();
        let inserted = 0;
        // Fetch messages in batches
        while (true) {
            console.log(`fetching from ${lastId}`);
            const messages = await channel.messages.fetch({
                limit: 100,
                after: lastId,
            });
            if (!messages.size)
                break;
            // Convert to array and sort by createdTimestamp ascending (oldest -> newest)
            const batch = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            console.log(`Fetched ${inserted} unique so far`);
            // De-duplicate by ID
            for (const msg of messages.values()) {
                if (!seen.has(msg.id)) {
                    seen.add(msg.id);
                    fetchedMessages.push(msg); // only store content if you want
                    const parsedLines = msg.content
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((l) => parseLine(l))
                        .filter((l) => !!l);
                    if (!parsedLines.length)
                        continue;
                    for (const line of parsedLines) {
                        if (line == undefined)
                            continue;
                        const { gid, kills, deaths, score, rank, username, clan } = line;
                        await connection.execute(`INSERT INTO tanks_history
                          (gid, username, clan_tag, rank, score, kills, deaths, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                            gid,
                            username,
                            clan ?? null, // avoid "undefined"
                            rank,
                            score,
                            kills,
                            deaths,
                            msg.createdAt, // mysql2 will serialize Date -> DATETIME/TIMESTAMP
                        ]);
                        inserted++;
                    }
                }
            }
            // Move window forward: use the *NEWEST* message from this batch
            // Advance to the newest message we processed in this batch
            // (batch is sorted oldest->newest so last element is newest)
            lastId = batch[batch.length - 1]?.id;
        }
        console.log(`Fetched ${fetchedMessages.length} messages inserted ${inserted} GIDs`);
        return interaction.editReply(`✅ Backfill complete. Processed lines, updated/inserted ${inserted} GIDs.`);
    }
    catch (err) {
        console.error('Backfill error: ', err);
        return interaction.editReply('❌ Something went wrong during the backfill.');
    }
}
