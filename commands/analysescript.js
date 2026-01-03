import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import connection from '../database/connect.js';
/* ---------------- config ---------------- */
const TEN_MINUTES = 10 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;
/* ---------------- scaling rules ---------------- */
function immediateScale(size, count) {
    if (size === "small" && count > 35)
        return "medium";
    if (size === "medium" && count > 65)
        return "large";
    if (size === "large" && count < 50)
        return "medium";
    if (size === "medium" && count < 25)
        return "small";
    return size;
}
function getBoundary(from, to) {
    if (from === "small" && to === "medium")
        return 35;
    if (from === "medium" && to === "large")
        return 65;
    if (from === "large" && to === "medium")
        return 50;
    if (from === "medium" && to === "small")
        return 25;
    throw new Error("Invalid transition");
}
/* ---------------- analysis ---------------- */
async function analyzeDay(day) {
    const start = new Date(`${day}T00:00:00Z`).getTime();
    const end = new Date(`${day}T23:59:59Z`).getTime();
    const [rows] = await connection.query(`SELECT timestamp, playerCount
       FROM trader2_players
       WHERE timestamp BETWEEN ? AND ?
       ORDER BY timestamp ASC`, [start, end]);
    const samples = rows.map(r => ({
        timestamp: Number(r.timestamp),
        playerCount: r.playerCount
    }));
    let immediateSize = "small";
    let delayedSize = "small";
    let immediateUps = 0;
    let immediateDowns = 0;
    let delayedUps = 0;
    let delayedDowns = 0;
    const events = [];
    let pending = null;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        /* ---------- immediate ---------- */
        const nextImmediate = immediateScale(immediateSize, s.playerCount);
        if (nextImmediate !== immediateSize) {
            const boundary = getBoundary(immediateSize, nextImmediate);
            events.push({
                from: immediateSize,
                to: nextImmediate,
                immediateTime: s.timestamp,
                boundary
            });
            if (nextImmediate > immediateSize)
                immediateUps++;
            else
                immediateDowns++;
            immediateSize = nextImmediate;
        }
        /* ---------- delayed ---------- */
        if (!pending) {
            const next = immediateScale(delayedSize, s.playerCount);
            if (next !== delayedSize) {
                pending = {
                    from: delayedSize,
                    to: next,
                    immediateTime: s.timestamp,
                    boundary: getBoundary(delayedSize, next)
                };
            }
        }
        else {
            const diff = Math.abs(s.playerCount - pending.boundary);
            if (diff <= 10) {
                pending.delayedTime = s.timestamp;
                const delay = s.timestamp - pending.immediateTime;
                if (delay > ONE_MINUTE) {
                    pending.samples = samples.filter(x => x.timestamp >= s.timestamp - TEN_MINUTES &&
                        x.timestamp <= s.timestamp);
                }
                if (pending.to > pending.from)
                    delayedUps++;
                else
                    delayedDowns++;
                events.push(pending);
                delayedSize = pending.to;
                pending = null;
            }
        }
    }
    return {
        samples: samples.length,
        immediateUps,
        immediateDowns,
        delayedUps,
        delayedDowns,
        delayedSlower: events.filter(e => e.delayedTime && e.delayedTime - e.immediateTime > ONE_MINUTE)
    };
}
/* ---------------- command ---------------- */
export default {
    data: new SlashCommandBuilder()
        .setName("analyze-scaling")
        .setDescription("Analyze scaling behavior for a specific day")
        .addStringOption(opt => opt
        .setName("day")
        .setDescription("Day to analyze (YYYY-MM-DD)")
        .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const day = interaction.options.getString("day", true);
            const result = await analyzeDay(day);
            let output = `📊 **Scaling Analysis – ${day}**\n\n` +
                `Samples: **${result.samples}**\n\n` +
                `🔁 **Immediate scaling**\n` +
                `• Ups: **${result.immediateUps}**\n` +
                `• Downs: **${result.immediateDowns}**\n\n` +
                `⏱️ **Delayed scaling**\n` +
                `• Ups: **${result.delayedUps}**\n` +
                `• Downs: **${result.delayedDowns}**\n\n` +
                `⚠️ **Delayed > 1 min events:** ${result.delayedSlower.length}\n`;
            for (const e of result.delayedSlower.slice(0, 3)) {
                output +=
                    `\n➡️ ${e.from} → ${e.to} (delay ${(e.delayedTime - e.immediateTime) / 60000} min)\n`;
                if (e.samples) {
                    output += e.samples
                        .map(s => `• ${new Date(s.timestamp).toISOString()} → ${s.playerCount}`)
                        .join("\n");
                    output += "\n";
                }
            }
            await interaction.editReply(output.slice(0, 1900));
        }
        catch (err) {
            console.error(err);
            await interaction.editReply("❌ Analysis failed.");
        }
    }
};
