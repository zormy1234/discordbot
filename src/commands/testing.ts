import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    ChannelType,
    TextChannel,
    NewsChannel,
  } from 'discord.js';
  
  import connection from '../database/connect.js';
  
  interface ParsedPlayerResult {
    rank: number;
    gid: string;
    clan: string | null;
    username: string;
    score: number;
    kills: number;
    playerKills: number;
    deaths: number;
  }
  
  interface AggregatedPlayer {
    gid: string;
    latestUsername: string;
    latestClan: string | null;
  
    totalGames: number;
  
    totalKills: number;
    totalPlayerKills: number;
    totalDeaths: number;
  
    bestSingleGameKd: number;
  }
  
  class RedcoatsImporter {
    async fetchAllMessages(
      channel: TextChannel | NewsChannel
    ) {
      const messages = [];
  
      let before: string | undefined;
  
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
  
        console.log(
          `[Redcoats Import] Fetched ${messages.length} messages`
        );
      }
  
      return messages;
    }
  
    parseResults(content: string): ParsedPlayerResult[] {
      const lines = content
        .split('\n')
        .map((x) => x.replace(/\r/g, ''))
        .filter(Boolean);
  
      const results: ParsedPlayerResult[] = [];
  
      for (const line of lines) {
        const trimmed = line.trim();
  
        if (!trimmed) continue;
  
        if (trimmed.startsWith('Rank')) continue;
  
        if (/^-+$/.test(trimmed)) continue;
  
        const parts = trimmed.split(/\s+/);
  
        if (parts.length < 7) continue;
  
        const rank = Number(parts[0]);
        const gid = parts[1];
  
        const deaths = Number(parts[parts.length - 1]);
        const playerKills = Number(parts[parts.length - 2]);
        const kills = Number(parts[parts.length - 3]);
        const score = Number(parts[parts.length - 4]);
  
        const middle = parts.slice(2, -4);
  
        let clan: string | null = null;
        let username = '';
  
        if (middle.length === 1) {
          username = middle[0];
        } else {
          clan = middle[0];
          username = middle.slice(1).join(' ');
        }
  
        if (!gid || !username) continue;
  
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
  
    aggregatePlayers(
      results: ParsedPlayerResult[]
    ): AggregatedPlayer[] {
      const map = new Map<string, AggregatedPlayer>();
  
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
  
        player.latestUsername = r.username;
        player.latestClan = r.clan;
  
        player.totalGames += 1;
  
        player.totalKills += r.kills;
        player.totalPlayerKills += r.playerKills;
        player.totalDeaths += r.deaths;
  
        const kd =
          r.deaths === 0
            ? r.playerKills
            : r.playerKills / r.deaths;
  
        if (kd > player.bestSingleGameKd) {
          player.bestSingleGameKd = kd;
        }
      }
  
      return [...map.values()];
    }
  
    averageKd(player: AggregatedPlayer) {
      if (player.totalDeaths === 0) {
        return player.totalPlayerKills;
      }
  
      return player.totalPlayerKills / player.totalDeaths;
    }
  
    async rebuildTable(players: AggregatedPlayer[]) {
      await connection.execute(`
        TRUNCATE TABLE redcoats_player_stats
      `);
  
      if (!players.length) {
        return;
      }
  
      const values = players.map((p) => [
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
  
      await connection.execute(
        `
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
        `,
        values.flat()
      );
    }
  
    async run(
      channel: TextChannel | NewsChannel
    ) {
      const messages = await this.fetchAllMessages(channel);
  
      const allResults: ParsedPlayerResult[] = [];
  
      for (const msg of messages) {
        const parsed = this.parseResults(msg.content);
  
        if (parsed.length) {
          allResults.push(...parsed);
          allResults.push(...parsed);
        }
      }
  
      const players = this.aggregatePlayers(allResults);
  
      await this.rebuildTable(players);
  
      return {
        messages: messages.length,
        records: allResults.length,
        players: players.length,
      };
    }
  }
  
  export const data = new SlashCommandBuilder()
    .setName('redcoats')
    .setDescription('Redcoats commands')
  
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    )
  
    .addSubcommand((sub) =>
      sub
        .setName('import')
        .setDescription(
          'Import all Redcoats stats from this channel'
        )
    );
  
  export async function execute(
    interaction: ChatInputCommandInteraction
  ) {
    await interaction.deferReply();
  
    try {
      const sub = interaction.options.getSubcommand();
  
      if (sub !== 'import') {
        return interaction.editReply(
          'Unknown subcommand.'
        );
      }
  
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.Administrator
        )
      ) {
        return interaction.editReply(
          '❌ Administrator permission required.'
        );
      }
  
      const channel = interaction.channel;
  
      if (!channel) {
        return interaction.editReply(
          'Could not determine channel.'
        );
      }
  
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      ) {
        return interaction.editReply(
          'This command can only be run inside a text or announcement channel.'
        );
      }
  
      const importer = new RedcoatsImporter();
  
      const result = await importer.run(channel);
  
      return interaction.editReply(
        [
          '✅ Redcoats import complete',
          '',
          `Messages scanned: ${result.messages}`,
          `Player records parsed: ${result.records}`,
          `Unique players imported: ${result.players}`,
        ].join('\n')
      );
    } catch (err) {
      console.error('Redcoats import failed:', err);
  
      return interaction.editReply(
        '❌ Import failed. Check console logs.'
      );
    }
  }