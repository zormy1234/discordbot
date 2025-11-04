import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ComponentType,
} from 'discord.js';
import connection from '../database/connect.js';
import { RowDataPacket } from 'mysql2/promise';

export const data = new SlashCommandBuilder()
  .setName('tanks_highest_stats')
  .setDescription('Find a Tanks3D player and view their highest stats')
  .addStringOption(option =>
    option
      .setName('name')
      .setDescription('Player name to search for')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('clan')
      .setDescription('Optional clan tag to filter by')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString('name', true);
  const clan = interaction.options.getString('clan') ?? null;

  if (name.length < 2) {
    return interaction.editReply('❌ Please enter a name longer than 1 character.');
  }

  // Step 1: Lookup potential players
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
    SELECT gid, recent_name, recent_clan_tag, total_score
    FROM tanks_totals
    WHERE recent_name LIKE ?
    ${clan ? 'AND recent_clan_tag = ?' : ''}
    ORDER BY total_score DESC
    LIMIT 5
    `,
    clan ? [`%${name}%`, clan] : [`%${name}%`]
  );

  if (!rows.length) {
    return interaction.editReply(
      `❌ No players found for **${name}**${clan ? ` in clan ${clan}` : ''}.`
    );
  }

  // Step 2: Build select menu options
  const options = rows.map(r => ({
    label: `${r.recent_name} ${r.recent_clan_tag ? `[${r.recent_clan_tag}]` : ''}`,
    description: `Score: ${r.total_score.toLocaleString()} | GID: ${r.gid}`,
    value: r.gid.toString(),
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_gid')
    .setPlaceholder('Select a player to view highest stats')
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.editReply({
    content: `Found ${rows.length} matching player(s) for **${name}**:`,
    components: [row],
  });

  // Step 3: Wait for user selection
  const msg = await interaction.fetchReply();

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60_000,
  });

  collector.on('collect', async selectInteraction => {
    if (selectInteraction.user.id !== interaction.user.id) {
      return selectInteraction.reply({
        content: 'You can’t use this selection — it’s not your lookup.',
        ephemeral: true,
      });
    }

    const gid = selectInteraction.values[0];

    // Step 4: Fetch stats for selected player
    const [statsRows] = await connection.execute<RowDataPacket[]>(
      `
      SELECT 
        highest_score, 
        highest_kills, 
        highest_deaths, 
        highest_kd, 
        recent_name, 
        recent_clan_tag
      FROM tanks_totals 
      WHERE gid = ?
      `,
      [gid]
    );

    if (!statsRows.length) {
      return selectInteraction.update({
        content: `❌ No data found for GID \`${gid}\`.`,
        components: [],
      });
    }

    const stats = statsRows[0];
    const embed = new EmbedBuilder()
      .setTitle(
        `🏆 Highest Stats for ${stats.recent_clan_tag || ''} ${
          stats.recent_name || 'Unknown'
        } (${gid})`
      )
      .setColor(0xffd700)
      .addFields(
        {
          name: 'Highest Score',
          value: Number(stats.highest_score).toLocaleString(),
          inline: true,
        },
        {
          name: 'Highest Kills',
          value: Number(stats.highest_kills).toLocaleString(),
          inline: true,
        },
        {
          name: 'Highest Deaths',
          value: Number(stats.highest_deaths).toLocaleString(),
          inline: true,
        },
        {
          name: 'Highest K/D Ratio',
          value:
            stats.highest_kd && stats.highest_kd > 0
              ? stats.highest_kd.toFixed(2)
              : 'N/A',
          inline: true,
        }
      )
      .setTimestamp();

    await selectInteraction.update({
      content: `📊 Showing stats for GID \`${gid}\`:`,
      embeds: [embed],
      components: [],
    });
  });

  collector.on('end', async () => {
    // disable menu when expired
    await interaction.editReply({
      components: [],
    });
  });
}
