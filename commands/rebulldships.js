import { PermissionFlagsBits, SlashCommandBuilder, } from "discord.js";
import connection from '../database/connect.js';
import { parseShipsLine } from "../handle_winlogs/ReceiveWinlogs.js"; // same structure as parseLine
import dayjs from "dayjs";
export const data = new SlashCommandBuilder()
    .setName("backfill_ships")
    .setDescription("Rebuild ships history and totals from Discord winlogs")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) => option
    .setName("after")
    .setDescription("Only fetch messages after this message ID")
    .setRequired(false));
export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    try {
        const channel = interaction.channel;
        if (!channel?.isTextBased()) {
            return interaction.editReply("❌ Run this in a text-based channel.");
        }
        const afterMessageId = interaction.options.getString("after") ?? undefined;
        const seen = new Set();
        let insertedHistory = 0;
        console.log("📥 Starting ships backfill...");
        let lastId = afterMessageId;
        while (true) {
            const messages = await channel.messages.fetch({ limit: 100, after: lastId });
            if (!messages.size)
                break;
            const batch = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            for (const msg of batch) {
                if (!msg.content?.trim() || seen.has(msg.id))
                    continue;
                seen.add(msg.id);
                const parsedLines = msg.content
                    .replace(/```/g, "")
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .map(parseShipsLine)
                    .filter((p) => p != null);
                if (!parsedLines.length)
                    continue;
                for (const row of parsedLines) {
                    const { gid, username, clan, rank, kills, deaths } = row;
                    const created_at = msg.createdAt;
                    // 1️⃣ Insert into ships_history
                    const createdAtUTC = new Date(created_at).toISOString().slice(0, 19).replace('T', ' ');
                    // Then insert:
                    await connection.execute(`INSERT INTO ships_history
              (gid, username, clan_tag, rank, kills, deaths, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, [gid, username, clan ?? null, rank, kills, deaths, createdAtUTC]);
                    insertedHistory++;
                    // 2️⃣ Upsert into ships_totals
                    const kd = deaths > 0 ? kills / deaths : kills;
                    // 3️⃣ Upsert into ships_daily_totals
                    const day = dayjs(created_at).format("YYYY-MM-DD");
                }
            }
            lastId = batch[batch.length - 1]?.id;
            console.log(`✅ Processed ${seen.size} messages so far...`);
        }
        await interaction.editReply(`✅ Finished backfill — inserted ${insertedHistory} history rows.`);
    }
    catch (err) {
        console.error("Backfill ships error:", err);
        return interaction.editReply("❌ Failed during backfill.");
    }
}
