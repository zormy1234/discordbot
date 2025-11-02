import { storeInShipsDb, storeInDb as storeInTanksDb } from './StoreWinLogs.js';
import forwardWinlogs from './ForwardWinLogs.js';
export function parseTanksLine(line) {
    const trimmed = line.trim();
    if (!trimmed)
        return null;
    // Match last three numeric columns (score, kills, deaths), allowing commas
    const match = trimmed.match(/(\d{1,3}(?:,\d{3})*)\s+(\d+)\s+(\d+)$/);
    if (!match)
        return null;
    const [_, scoreStr, killsStr, deathsStr] = match;
    const score = parseInt(scoreStr.replace(/,/g, ''), 10);
    const kills = parseInt(killsStr, 10);
    const deaths = parseInt(deathsStr, 10);
    // Remove the numeric columns from the end
    const rest = trimmed.slice(0, match.index).trim();
    // First two columns: rank and gid
    const parts = rest.split(/\s+/);
    if (parts.length < 2)
        return null;
    const rank = parseInt(parts[0], 10);
    const gid = parts[1];
    // Everything in between is clan (optional) + username
    let clan = '';
    let username = '';
    if (parts.length === 3) {
        // No clan
        username = parts[2];
    }
    else if (parts.length >= 4) {
        clan = parts[2];
        username = parts.slice(3).join(' ');
    }
    return { rank, gid, clan, username, score, kills, deaths };
}
export function parseShipsLine(line) {
    const trimmed = line.trim();
    if (!trimmed)
        return null;
    // Match the last two numeric columns (kills, deaths)
    const match = trimmed.match(/(\d+)\s+(\d+)$/);
    if (!match)
        return null;
    const [_, killsStr, deathsStr] = match;
    const kills = parseInt(killsStr, 10);
    const deaths = parseInt(deathsStr, 10);
    // Remove the numeric columns from the end
    const rest = trimmed.slice(0, match.index).trim();
    // Split remaining text into columns
    const parts = rest.split(/\s+/);
    if (parts.length < 3)
        return null; // rank, gid, username (minimum)
    const rank = parseInt(parts[0], 10);
    const gid = parts[1];
    // Determine if clan tag exists
    let clan = '';
    let username = '';
    if (parts.length === 3) {
        // No clan
        username = parts[2];
    }
    else if (parts.length >= 4) {
        clan = parts[2];
        username = parts.slice(3).join(' ');
    }
    const score = 0;
    return { rank, gid, clan, username, score, kills, deaths };
}
export default function handleWinlogs(client) {
    client.on('messageCreate', async (message) => {
        if (message.author.id === client.user?.id)
            return;
        if (message.guild?.id === process.env.WINLOGS_DISCORD &&
            message.channel.id === process.env.WINLOGS_CHANNEL) {
            const content = message.content.replace(/```/g, '');
            const lines = content
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .flatMap((l) => {
                const parsed = parseTanksLine(l);
                return { raw: l, parsed: parsed };
            })
                .filter((parsedWithLine) => parsedWithLine.parsed != undefined);
            if (lines.length == 0) {
                return;
            }
            console.log(`recieved message for tanks starting with line ${lines[0].raw}`);
            await forwardWinlogs(client, lines);
            await storeInTanksDb(lines, message);
            console.log(`finished handling line starting with line ${lines[0].raw}`);
        }
        if (message.guild?.id === process.env.SHIPS_WINLOGS_DISCORD &&
            message.channel.id === process.env.SHIPS_WINLOGS_CHANNEL) {
            const content = message.content.replace(/```/g, '');
            const lines = content
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .flatMap((l) => {
                const parsed = parseShipsLine(l);
                return { raw: l, parsed: parsed };
            })
                .filter((parsedWithLine) => parsedWithLine.parsed != undefined);
            if (lines.length == 0) {
                return;
            }
            console.log(`recieved message for ships starting with line ${lines[0].raw}`);
            await storeInShipsDb(lines, message);
            console.log(`finished handling line starting with line ${lines[0].raw}`);
        }
    });
}
// average k/d should be average of your k/ds, not total kills divided by total deaths, because thats messed up when deaths are 0
