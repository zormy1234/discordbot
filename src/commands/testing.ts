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
  
  class RedcoatsImporter {
    // =========================
    // FETCH MESSAGES
    // =========================
    async fetchAllMessages(channel: TextChannel | NewsChannel) {
      const messages = [];
  
      let before: string | undefined;
  
      while (true) {
        const batch = await channel.messages.fetch({
          limit: 100,
          before,
        });
  
        if (!batch.size) break;
  
        messages.push(...batch.values());
        before = batch.last()?.id;
      }
  
      return messages;
    }
  
    // =========================
    // PARSER
    // =========================
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
  
    // =========================
    // STORE GAME RESULTS (RAW)
    // =========================
    async insertGameResults(rows: ParsedPlayerResult[]) {
      const values = rows.map((r) => [
        r.gid,
        r.username,
        r.clan,
        r.rank,
        r.score,
        r.kills,
        r.playerKills,
        r.deaths,
        r.playerKills / Math.max(r.deaths, 1),
      ]);
  
      if (!values.length) return;
  
      const placeholders = values.map(() => '(?,?,?,?,?,?,?,?,?)').join(',');
  
      await connection.execute(
        `
        INSERT INTO redcoats_game_results (
          gid,
          username,
          latest_clan,
          rank,
          score,
          kills,
          player_kills,
          deaths,
          kd
        )
        VALUES ${placeholders}
        `,
        values.flat()
      );
    }
  
    // =========================
    // PLAYER NAMES TABLE
    // =========================
    async upsertPlayerNames(rows: ParsedPlayerResult[]) {
      const values = rows.map((r) => [r.gid, r.username]);
  
      const placeholders = values.map(() => '(?, ?)').join(',');
  
      await connection.execute(
        `
        INSERT INTO redcoats_player_names (gid, username)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          last_seen = CURRENT_TIMESTAMP
        `,
        values.flat()
      );
    }
  
    // =========================
    // REBUILD PLAYER STATS FROM GAME RESULTS
    // =========================
    async rebuildPlayerStats() {
      await connection.execute(`
        INSERT INTO redcoats_player_stats (
          gid,
          latest_username,
          latest_clan,
          total_games,
          total_score,
          total_kills,
          total_player_kills,
          total_deaths,
          highest_score,
          best_single_game_kd,
          average_kd,
          last_seen
        )
        SELECT
          gid,
          MAX(username) as latest_username,
          MAX(latest_clan) as latest_clan,
          COUNT(*) as total_games,
          SUM(score) as total_score,
          SUM(kills) as total_kills,
          SUM(player_kills) as total_player_kills,
          SUM(deaths) as total_deaths,
          MAX(score) as highest_score,
          MAX(kd) as best_single_game_kd,
          SUM(player_kills) / GREATEST(SUM(deaths), 1) as average_kd,
          MAX(created_at) as last_seen
        FROM redcoats_game_results
        GROUP BY gid
        ON DUPLICATE KEY UPDATE
          latest_username = VALUES(latest_username),
          latest_clan = VALUES(latest_clan),
          total_games = VALUES(total_games),
          total_score = VALUES(total_score),
          total_kills = VALUES(total_kills),
          total_player_kills = VALUES(total_player_kills),
          total_deaths = VALUES(total_deaths),
          highest_score = VALUES(highest_score),
          best_single_game_kd = VALUES(best_single_game_kd),
          average_kd = VALUES(average_kd),
          last_seen = VALUES(last_seen)
      `);
    }
  
    // =========================
    // REBUILD DAILY STATS
    // =========================
    async rebuildDailyStats() {
      await connection.execute(`
        INSERT INTO redcoats_daily_stats (
          gid,
          stat_date,
          total_player_kills,
          total_kills,
          average_kd,
          games_played
        )
        SELECT
          gid,
          DATE(created_at) as stat_date,
          SUM(player_kills),
          SUM(kills),
          AVG(kd),
          COUNT(*)
        FROM redcoats_game_results
        GROUP BY gid, DATE(created_at)
        ON DUPLICATE KEY UPDATE
          total_player_kills = VALUES(total_player_kills),
          total_kills = VALUES(total_kills),
          average_kd = VALUES(average_kd),
          games_played = VALUES(games_played)
      `);
    }
  
    // =========================
    // MAIN RUN
    // =========================
    async run(channel: TextChannel | NewsChannel) {
      const start = Date.now();
  
      const messages = await this.fetchAllMessages(channel);
  
      const allResults: ParsedPlayerResult[] = [];
  
      for (const msg of messages) {
        const parsed = this.parseResults(msg.content);
        if (parsed.length) allResults.push(...parsed);
      }
  
      // 1. RAW GAME INSERTS
      await this.insertGameResults(allResults);
  
      // 2. PLAYER NAME TRACKING
      await this.upsertPlayerNames(allResults);
  
      // 3. REBUILD DERIVED TABLES
      await this.rebuildPlayerStats();
      await this.rebuildDailyStats();
  
      return {
        messages: messages.length,
        records: allResults.length,
        duration: ((Date.now() - start) / 1000).toFixed(1),
      };
    }
  }
  
  // =========================
  // DISCORD COMMAND
  // =========================
  
  export const data = new SlashCommandBuilder()
    .setName('no')
    .setDescription('Redcoats commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('import')
        .setDescription('Import all Redcoats stats from this channel')
    );
  
  export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
  
    try {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.Administrator
        )
      ) {
        return interaction.editReply('❌ Administrator permission required.');
      }
  
      const channel = interaction.channel;
  
      if (!channel) {
        return interaction.editReply('Could not determine channel.');
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
  
      const result = await importer.run(
        channel as TextChannel | NewsChannel
      );
  
      return interaction.editReply(
        [
          '✅ Redcoats import complete',
          '',
          `Messages scanned: ${result.messages}`,
          `Player records parsed: ${result.records}`,
          `Duration: ${result.duration}s`,
        ].join('\n')
      );
    } catch (err) {
      console.error('Redcoats import failed:', err);
      return interaction.editReply('❌ Import failed. Check logs.');
    }
  }