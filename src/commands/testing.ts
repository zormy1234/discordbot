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
    createdAt: Date;
  }
  
  class RedcoatsImporter {
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
  
    parseResults(content: string, createdAt: Date): ParsedPlayerResult[] {
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
          createdAt
        });
      }
  
      return results;
    }
  
    // =========================
    // SAFE BULK INSERT (NO PLACEHOLDER LIMITS)
    // =========================
    async insertGameResults(rows: ParsedPlayerResult[]) {
      if (!rows.length) return;
  
      const BATCH_SIZE = 1000;
  
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
  
        const values = batch.map((r) => [
          r.gid,
          r.username,
          r.clan,
          r.rank,
          r.score,
          r.kills,
          r.playerKills,
          r.deaths,
          r.playerKills / Math.max(r.deaths, 1),
          r.createdAt
        ]);
  
        await connection.query(
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
            kd,
            created_at
          )
          VALUES ?
          `,
          [values]
        );
      }
    }
  
    async upsertPlayerNames(rows: ParsedPlayerResult[]) {
      if (!rows.length) return;
  
      const BATCH_SIZE = 1000;
  
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
  
        const values = batch.map((r) => [r.gid, r.username]);
  
        await connection.query(
          `
          INSERT INTO redcoats_player_names (gid, username)
          VALUES ?
          ON DUPLICATE KEY UPDATE
            last_seen = CURRENT_TIMESTAMP
          `,
          [values]
        );
      }
    }
  
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
          MAX(username),
          MAX(latest_clan),
          COUNT(*),
          SUM(score),
          SUM(kills),
          SUM(player_kills),
          SUM(deaths),
          MAX(score),
          MAX(kd),
          SUM(player_kills) / GREATEST(SUM(deaths), 1),
          MAX(created_at)
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
          DATE(created_at),
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
  
    async run(channel: TextChannel | NewsChannel) {
        const start = Date.now();
      
        const messages = await this.fetchAllMessages(channel);
      
        const allResults: ParsedPlayerResult[] = [];
      
        for (const msg of messages) {
          const parsed = this.parseResults(msg.content, msg.createdAt);
      
          if (parsed.length) {
            for (const row of parsed) {
              row.createdAt = msg.createdAt; // ✅ THIS IS THE FIX
            }
      
            allResults.push(...parsed);
          }
        }
      
        await this.insertGameResults(allResults);
        await this.upsertPlayerNames(allResults);
        await this.rebuildPlayerStats();
        await this.rebuildDailyStats();
      
        return {
          messages: messages.length,
          records: allResults.length,
          duration: ((Date.now() - start) / 1000).toFixed(1),
        };
      }
  }
  
  export const data = new SlashCommandBuilder()
    .setName('no')
    .setDescription('Redcoats commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName('import').setDescription('Import all Redcoats stats')
    );
  
  export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
  
    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return interaction.editReply('❌ Admin only.');
    }
  
    const channel = interaction.channel;
  
    if (!channel) {
      return interaction.editReply('No channel found.');
    }
  
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    ) {
      return interaction.editReply('Invalid channel type.');
    }
  
    const importer = new RedcoatsImporter();
  
    const result = await importer.run(
      channel as TextChannel | NewsChannel
    );
  
    return interaction.editReply(
      [
        '✅ Import complete',
        '',
        `Messages: ${result.messages}`,
        `Records: ${result.records}`,
        `Duration: ${result.duration}s`,
      ].join('\n')
    );
  }