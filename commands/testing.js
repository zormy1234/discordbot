import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, } from 'discord.js';
import connection from '../database/connect.js';
class RedcoatsImporter {
    async fetchAllMessages(channel) {
        const messages = [];
        let before;
        while (true) {
            const batch = await channel.messages.fetch({
                limit: 100,
                before,
            });
            if (!batch.size) {
                break;
            }
            messages.push(...batch.values());
            before = batch.last()?.id;
            console.log(`[Redcoats Import] Fetched ${messages.length} messages`);
        }
        return messages;
    }
    parseResults(content) {
        const lines = content
            .split('\n')
            .map((x) => x.replace(/\r/g, ''))
            .filter(Boolean);
        const results = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            if (trimmed.startsWith('Rank'))
                continue;
            if (/^-+$/.test(trimmed))
                continue;
            const parts = trimmed.split(/\s+/);
            if (parts.length < 7) {
                continue;
            }
            const rank = Number(parts[0]);
            const gid = parts[1];
            const deaths = Number(parts[parts.length - 1]);
            const playerKills = Number(parts[parts.length - 2]);
            const kills = Number(parts[parts.length - 3]);
            const score = Number(parts[parts.length - 4]);
            const middle = parts.slice(2, -4);
            let clan = null;
            let username = '';
            if (middle.length === 1) {
                username = middle[0];
            }
            else {
                clan = middle[0];
                username = middle.slice(1).join(' ');
            }
            if (!gid || !username) {
                continue;
            }
            results.push({
                rank,
                gid,
                clan,
                username,
                score,
                kills,
                playerKills,
                deaths,
            });
        }
        return results;
    }
    aggregatePlayers(results) {
        const map = new Map();
        for (const r of results) {
            let player = map.get(r.gid);
            if (!player) {
                player = {
                    gid: r.gid,
                    latestUsername: r.username,
                    latestClan: r.clan,
                    totalGames: 0,
                    totalKills: 0,
                    totalPlayerKills: 0,
                    totalDeaths: 0,
                    bestSingleGameKd: 0,
                };
                map.set(r.gid, player);
            }
            // Keep latest seen values
            player.latestUsername = r.username;
            player.latestClan = r.clan;
            player.totalGames += 1;
            player.totalKills += r.kills;
            player.totalPlayerKills += r.playerKills;
            player.totalDeaths += r.deaths;
            const kd = r.deaths === 0
                ? r.playerKills
                : r.playerKills / r.deaths;
            if (kd > player.bestSingleGameKd) {
                player.bestSingleGameKd = kd;
            }
        }
        return [...map.values()];
    }
    averageKd(player) {
        if (player.totalDeaths === 0) {
            return player.totalPlayerKills;
        }
        return player.totalPlayerKills / player.totalDeaths;
    }
    async rebuildTable(players) {
        const conn = await connection.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute(`
          TRUNCATE TABLE redcoats_player_stats
        `);
            if (!players.length) {
                await conn.commit();
                return;
            }
            const BATCH_SIZE = 1000;
            for (let i = 0; i < players.length; i += BATCH_SIZE) {
                const batch = players.slice(i, i + BATCH_SIZE);
                const values = batch.map((p) => [
                    p.gid,
                    p.latestUsername,
                    p.latestClan,
                    p.totalPlayerKills,
                    p.totalKills,
                    this.averageKd(p),
                    p.bestSingleGameKd,
                    p.totalGames,
                ]);
                const placeholders = values
                    .map(() => '(?,?,?,?,?,?,?,?)')
                    .join(',');
                await conn.execute(`
            INSERT INTO redcoats_player_stats (
              gid,
              latest_username,
              latest_clan,
              total_player_kills,
              total_kills,
              average_kd,
              best_single_game_kd,
              total_games
            )
            VALUES ${placeholders}
            `, values.flat());
                console.log(`[Redcoats Import] Inserted ${Math.min(i + BATCH_SIZE, players.length)}/${players.length} players`);
            }
            await conn.commit();
            console.log(`[Redcoats Import] Successfully imported ${players.length} players`);
        }
        catch (err) {
            await conn.rollback();
            console.error('[Redcoats Import] Transaction rolled back', err);
            throw err;
        }
        finally {
            conn.release();
        }
    }
    async run(channel) {
        const start = Date.now();
        const messages = await this.fetchAllMessages(channel);
        const allResults = [];
        for (const msg of messages) {
            const parsed = this.parseResults(msg.content);
            if (parsed.length) {
                allResults.push(...parsed);
            }
        }
        const players = this.aggregatePlayers(allResults);
        await this.rebuildTable(players);
        return {
            messages: messages.length,
            records: allResults.length,
            players: players.length,
            duration: ((Date.now() - start) /
                1000).toFixed(1),
        };
    }
}
export const data = new SlashCommandBuilder()
    .setName('redcoats')
    .setDescription('Redcoats commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub
    .setName('import')
    .setDescription('Import all Redcoats stats from this channel'));
export async function execute(interaction) {
    await interaction.deferReply();
    try {
        const sub = interaction.options.getSubcommand();
        if (sub !== 'import') {
            return interaction.editReply('Unknown subcommand.');
        }
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.editReply('❌ Administrator permission required.');
        }
        const channel = interaction.channel;
        if (!channel) {
            return interaction.editReply('Could not determine channel.');
        }
        if (channel.type !==
            ChannelType.GuildText &&
            channel.type !==
                ChannelType.GuildAnnouncement) {
            return interaction.editReply('This command can only be run inside a text or announcement channel.');
        }
        const importer = new RedcoatsImporter();
        const result = await importer.run(channel);
        return interaction.editReply([
            '✅ Redcoats import complete',
            '',
            `Messages scanned: ${result.messages}`,
            `Player records parsed: ${result.records}`,
            `Unique players imported: ${result.players}`,
            `Duration: ${result.duration}s`,
        ].join('\n'));
    }
    catch (err) {
        console.error('Redcoats import failed:', err);
        return interaction.editReply('❌ Import failed. Check console logs.');
    }
}
