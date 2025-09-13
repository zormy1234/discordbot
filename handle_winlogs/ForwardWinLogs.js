import connection from '../database/connect.js';
export default async function forwardWinlogs(client, lines) {
    const [rows] = await connection.execute(`SELECT guild_id, tanks_clan_tag, tanks_winlog_channel_id 
       FROM clan_discord_details
       WHERE tanks_clan_tag IS NOT NULL AND tanks_clan_tag != ''`);
    const clanMap = new Map();
    for (const row of rows) {
        if (!clanMap.has(row.tanks_clan_tag)) {
            clanMap.set(row.tanks_clan_tag, []);
        }
        clanMap.get(row.tanks_clan_tag).push({
            guildId: row.guild_id,
            winlogChannelId: row.tanks_winlog_channel_id,
        });
    }
    for (const line of lines) {
        if (line.parsed == undefined)
            return;
        const clanTag = line.parsed?.clan;
        if (!clanTag || clanTag == '')
            continue;
        const clanDetails = clanMap.get(clanTag);
        if (!clanDetails)
            continue;
        for (const row of clanDetails) {
            const guild = client.guilds.cache.get(row.guildId);
            if (!guild)
                continue;
            const channel = guild.channels.cache.get(row.winlogChannelId);
            if (channel && channel.isTextBased()) {
                const winlogChannel = channel;
                await winlogChannel.send(`\`\`\`\n${line.raw}\n\`\`\``);
            }
        }
    }
}
