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
    .setName('ships_pvp_stats')
    .setDescription('Find a Ships3D player and view their highest/average stats for team flags pvp')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Player name to search for')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('clan')
        .setDescription('Optional clan tag to filter by')
        .setRequired(false)
    );
  
  export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
  
    const name = interaction.options.getString('name', true);
    const clan = interaction.options.getString('clan') ?? null;
  
    if (name.length < 2) {
      return interaction.editReply('❌ Please enter a name longer than 1 character.');
    }
  
    try {
      // Step 1: Find matching players
      const [rows] = await connection.execute<RowDataPacket[]>(
        `
        SELECT gid, recent_name, recent_clan_tag, avg_kd
        FROM ships_totals
        WHERE recent_name LIKE ?
        ${clan ? 'AND recent_clan_tag = ?' : ''}
        ORDER BY avg_kd DESC
        LIMIT 5
        `,
        clan ? [`%${name}%`, clan] : [`%${name}%`]
      );
  
      if (!rows.length) {
        return interaction.editReply(
          `❌ No Ships3D players found for **${name}**${clan ? ` in clan ${clan}` : ''}.`
        );
      }
  
      // Step 2: Let user pick which player
      const options = rows.map((r) => ({
        label: `${r.recent_name} ${r.recent_clan_tag ? `[${r.recent_clan_tag}]` : ''}`,
        description: `Avg K/D: ${r.avg_kd?.toFixed?.(2) || 'N/A'} | GID: ${r.gid}`,
        value: r.gid.toString(),
      }));
  
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_gid_ships')
        .setPlaceholder('Select a player to view stats')
        .addOptions(options);
  
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  
      await interaction.editReply({
        content: `Found ${rows.length} matching player(s) for **${name}**:`,
        components: [row],
      });
  
      // Step 3: Collect user selection
      const msg = await interaction.fetchReply();
  
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000,
      });
  
      collector.on('collect', async (selectInteraction) => {
        if (selectInteraction.user.id !== interaction.user.id) {
          return selectInteraction.reply({
            content: 'You can’t use this selection — it’s not your lookup.',
            ephemeral: true,
          });
        }
  
        const gid = selectInteraction.values[0];
  
        // Step 4: Fetch player’s Ships3D stats
        const [statsRows] = await connection.execute<RowDataPacket[]>(
          `
          SELECT 
              highest_kills,
              highest_kills_date,
              highest_kills_deaths,
              highest_kd,
              highest_kd_date,
              highest_kd_kills,
              highest_kd_deaths,
              avg_kd,
              recent_name,
              recent_clan_tag
          FROM ships_totals 
          WHERE gid = ?
          `,
          [gid]
        );
  
        if (!statsRows.length) {
          return selectInteraction.update({
            content: `❌ No stats found for GID \`${gid}\`.`,
            components: [],
          });
        }
  
        const stats = statsRows[0];
  
        // Step 5: Build response embed
        const embed = new EmbedBuilder()
          .setTitle(
            `🚢 Ships3D Stats for ${stats.recent_clan_tag || ''} ${
              stats.recent_name || 'Unknown'
            } (${gid})`
          )
          .setColor(0x0099ff)
          .addFields(
            {
              name: 'Highest Kills',
              value: `${stats.highest_kills?.toLocaleString?.() || 'N/A'} kills on ${
                stats.highest_kills_date
                  ? new Date(stats.highest_kills_date).toLocaleDateString()
                  : 'Unknown'
              }`,
              inline: false,
            },
            {
              name: 'Highest K/D',
              value: `${stats.highest_kd?.toFixed?.(2) || 'N/A'} on ${
                stats.highest_kd_date
                  ? new Date(stats.highest_kd_date).toLocaleDateString()
                  : 'Unknown'
              }`,
              inline: false,
            },
            {
              name: 'Kills / Deaths (Highest K/D Match)',
              value: `${stats.highest_kd_kills ?? 'N/A'} / ${
                stats.highest_kd_deaths ?? 'N/A'
              }`,
              inline: false,
            },
            {
              name: 'Average K/D',
              value: stats.avg_kd ? stats.avg_kd.toFixed(2) : 'N/A',
              inline: false,
            }
          )
          .setTimestamp();
  
        await selectInteraction.update({
          content: `Stats for GID \`${gid}\`:`,
          embeds: [embed],
          components: [],
        });
      });
  
      collector.on('end', async () => {
        await interaction.editReply({ components: [] });
      });
    } catch (err) {
      console.error('Ships3D stats command error:', err);
      return interaction.editReply({
        content: '❌ Something went wrong fetching stats for this player.',
      });
    }
  }
  