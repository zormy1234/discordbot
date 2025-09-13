import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import connection from '../database/connect.js';
import { parseLine } from '../handle_winlogs/ReceiveWinlogs.js';

export const data = new SlashCommandBuilder()
  .setName('backfill')
  .setDescription(
    'Backfill the tanks_totals database from all messages in this channel'
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option
      .setName('after')
      .setDescription('Only fetch messages after this message ID')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const channel = interaction.channel;
    if (!channel?.isTextBased()) {
      return interaction.editReply(
        '❌ This command must be run in a text channel.'
      );
    }
    console.log(`Running`);

    const afterMessageId = interaction.options.getString('after') ?? undefined;

    let fetchedMessages = [];
    let lastId: string | undefined = afterMessageId;

    const seen = new Set<string>();

    // Fetch messages in batches
    while (true) {
      const messages = await channel.messages.fetch({
        limit: 100,
        after: lastId,
      });
      if (!messages.size) break;

      // De-duplicate by ID
      for (const msg of messages.values()) {
        if (!seen.has(msg.id)) {
          seen.add(msg.id);
          fetchedMessages.push(msg.content); // only store content if you want
        }
      }

      // Move window forward: use the *oldest* message from this batch
      lastId = messages.last()?.id;
      console.log(
        `Fetched ${fetchedMessages.length} unique so far, lastId=${lastId}`
      );
    }
    console.log(`Fetched ${fetchedMessages.length} messages`);

    // Parse all lines
    const parsedLines = fetchedMessages
      .flatMap((msg) =>
        msg
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => parseLine(l))
      )
      .filter(Boolean);

    console.log(`Parsed ${parsedLines.length} valid lines`);

    // Group by GID
    const grouped: Record<
      string,
      {
        total_kills: number;
        total_deaths: number;
        total_score: number;
        total_rank: number;
        num_entries: number;
        highest_score: number;
        all_names: Set<string>;
        recent_name: string;
        recent_clan_tag: string;
      }
    > = {};

    for (const line of parsedLines) {
      if (line == undefined) return;
      const { gid, kills, deaths, score, rank, username, clan } = line;
      // console.log("before")
      // console.log(grouped[gid])
      if (!grouped[gid]) {
        grouped[gid] = {
          total_kills: 0,
          total_deaths: 0,
          total_score: 0,
          total_rank: 0,
          num_entries: 0,
          highest_score: 0,
          all_names: new Set(),
          recent_name: username,
          recent_clan_tag: clan || '',
        };
      }

      const g = grouped[gid];
      g.total_kills += kills;
      g.total_deaths += deaths;
      g.total_score += score;
      g.total_rank += rank;
      g.num_entries += 1;
      g.highest_score = Math.max(g.highest_score, score);
      g.all_names.add(username);
      g.recent_name = username;
      g.recent_clan_tag = clan || '';
    }

    let inserted = 0;

    // Upsert one row per GID
    for (const gid in grouped) {
      const g = grouped[gid];
      try {
        await connection.execute(
          `INSERT INTO tanks_totals
               (gid, total_kills, total_deaths, total_score, total_rank, num_entries, highest_score, all_names, recent_name, recent_clan_tag)
             VALUES (?, ?, ?, ?, ?, ?, ?, JSON_ARRAY(?), ?, ?)
             ON DUPLICATE KEY UPDATE
               total_kills = total_kills + VALUES(total_kills),
               total_deaths = total_deaths + VALUES(total_deaths),
               total_score = total_score + VALUES(total_score),
               total_rank = total_rank + VALUES(total_rank),
               num_entries = num_entries + VALUES(num_entries),
               highest_score = GREATEST(highest_score, VALUES(highest_score)),
               all_names = JSON_ARRAY_APPEND(all_names, '$', VALUES(recent_name)),
               recent_name = VALUES(recent_name),
               recent_clan_tag = VALUES(recent_clan_tag);`,
          [
            gid,
            g.total_kills,
            g.total_deaths,
            g.total_score,
            g.total_rank,
            g.num_entries,
            g.highest_score,
            Array.from(g.all_names).join('","'), // JSON_ARRAY requires a comma-separated string
            g.recent_name,
            g.recent_clan_tag,
          ]
        );
        inserted++;
      } catch (e) {
        console.error(
          `Failed inserting gid ${gid}:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    return interaction.editReply(
      `✅ Backfill complete. Processed ${parsedLines.length} lines, updated/inserted ${inserted} GIDs.`
    );
  } catch (err) {
    console.error('Backfill error: ', err);
    return interaction.editReply(
      '❌ Something went wrong during the backfill.'
    );
  }
}
