import connection from '../database/connect.js';
import { EmbedBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, } from 'discord.js';
/* -------------------------------------------------------------------------- */
/*                               CORE FUNCTIONS                               */
/* -------------------------------------------------------------------------- */
/**
 * Calculates bounty reward based on player's stats
 */
function calculateBountyGold(player, avgKills) {
    if (!player)
        return Math.floor(Math.random() * (1500 - 1000 + 1)) + 1000; //1000-1500
    const ratio = player.total_kills / avgKills;
    if (ratio >= 150)
        return Math.floor(Math.random() * (3000 - 2500 + 1)) + 2500; // 2500-3000
    if (ratio >= 10)
        return Math.floor(Math.random() * (2500 - 2000 + 1)) + 2000; // 2000-2500
    return Math.floor(Math.random() * (2000 - 1500 + 1)) + 1500; // 1500-2000
}
/**
 * Finds a player in ships_totals by name
 */
export async function findPlayerByName(name) {
    const [rows] = await connection.execute(`
    SELECT gid, recent_name, recent_clan_tag, total_kills 
    FROM ships_totals 
    WHERE recent_name LIKE ? 
    ORDER BY total_kills DESC 
    LIMIT 5
    `, [`%${name}%`]);
    return rows;
}
/**
 * Creates a bounty
 */
export async function createBounty(interaction) {
    const lowestBounty = Math.floor(Math.random() * 501) + 1000;
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    if (!guildId)
        return interaction.reply({
            content: '❌ Guild ID missing.',
            ephemeral: true,
        });
    // Check role permission first
    const [configRows] = await connection.execute(`SELECT bounty_role_id FROM bounty_config WHERE guild_id = ?`, [guildId]);
    const config = configRows[0];
    if (!config) {
        return interaction.editReply({
            content: '⚠️ No bounty setter role has been configured for this server yet.',
        });
    }
    const hasRole = interaction.member?.roles &&
        'cache' in interaction.member.roles &&
        interaction.member.roles.cache.has(config.bounty_role_id);
    if (!hasRole) {
        return interaction.editReply({
            content: `🚫 You must have the <@&${config.bounty_role_id}> role to create bounties.`,
        });
    }
    const imageAttachment = interaction.options.getAttachment('image');
    const imageUrl = imageAttachment?.url || undefined;
    const [countRows] = await connection.execute(`SELECT COUNT(*) AS total
       FROM bounties
       WHERE placed_by_discord_id = ? AND guild_id = ? AND status = 'active'`, [interaction.user.id, guildId]);
    const total = countRows[0].total;
    if (total >= 10) {
        return interaction.editReply({
            content: `🚫 You already have the maximum number of allowed open bounties (${total}).`,
        });
    }
    const search = interaction.options.getString('player', true);
    const reason = interaction.options.getString('reason') || ' ';
    // Search for player
    const [rows] = (await connection.execute(`SELECT gid, recent_name, recent_clan_tag, total_kills
       FROM ships_totals
       WHERE recent_name LIKE ?
       ORDER BY total_kills DESC
       LIMIT 5`, [`%${search}%`]));
    if (!rows.length) {
        await createBountyRecord(interaction, null, search, lowestBounty, reason, imageUrl);
        // ✅ Edit ephemeral reply
        await interaction.editReply({
            content: `🪙 Created a ${lowestBounty} gold bounty for **${search}** (unknown player).`,
        });
        await sendBountyCreatedMessage(interaction, search, lowestBounty, reason, imageUrl);
        return;
    }
    // If multiple players, show selection menu (ephemeral)
    const options = rows.map((r) => new StringSelectMenuOptionBuilder()
        .setLabel(`${r.recent_name}${r.recent_clan_tag ? ` [${r.recent_clan_tag}]` : ''}`)
        .setDescription(`GID: ${r.gid} | Kills: ${r.total_kills}`)
        .setValue(String(r.gid)));
    options.push(new StringSelectMenuOptionBuilder()
        .setLabel(`Use typed player: ${search}`)
        .setDescription('Create a bounty for this player directly')
        .setValue('custom_name'));
    const menu = new StringSelectMenuBuilder()
        .setCustomId('bounty_select')
        .setPlaceholder('Select a player to place a bounty on')
        .addOptions(options);
    const row = new ActionRowBuilder().addComponents(menu);
    await interaction.editReply({
        content: 'Select the player to place a bounty on:',
        components: [row],
    });
    const collector = interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 30_000,
    });
    collector?.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'This menu isn’t for you.', ephemeral: true });
        }
        await i.deferUpdate();
        const selected = i.values[0];
        let player = rows.find((r) => String(r.gid) === selected);
        let reward = lowestBounty;
        let targetName = search;
        if (selected === 'custom_name') {
            await createBountyRecord(interaction, null, search, reward, reason, imageUrl);
        }
        else if (player) {
            const [avgRow] = (await connection.execute(`SELECT AVG(total_kills) AS avg_kills FROM ships_totals`));
            const avgKills = avgRow[0]?.avg_kills || 1;
            targetName = player.recent_name;
            reward = calculateBountyGold(player, avgKills);
            await createBountyRecord(interaction, player.gid, targetName, reward, reason, imageUrl);
        }
        // ✅ Update ephemeral confirmation
        await interaction.editReply({
            content: `🪙 Bounty created for **${targetName}** worth **${reward} gold**.`,
            components: [],
        });
        await sendBountyCreatedMessage(interaction, targetName, reward, reason, imageUrl);
        collector.stop();
    });
    collector?.on('end', async () => {
        try {
            await interaction.editReply({ components: [] });
        }
        catch { }
    });
}
async function sendBountyCreatedMessage(interaction, targetName, reward, reason, imageUrl) {
    const channel = interaction.channel;
    if (!channel)
        return;
    const embed = new EmbedBuilder()
        .setTitle('🪙 New Bounty Created!')
        .addFields({ name: 'Target', value: targetName, inline: true }, { name: 'Reward', value: `${reward} gold`, inline: true }, { name: 'Reason', value: reason, inline: false }, { name: 'Placed by', value: `<@${interaction.user.id}>`, inline: false })
        .setTimestamp();
    if (imageUrl)
        embed.setThumbnail(imageUrl);
    await channel.send({ embeds: [embed] });
}
async function createBountyRecord(interaction, gid, name, reward, reason, imageUrl) {
    const [result] = await connection.execute(`INSERT INTO bounties (guild_id, target_gid, target_name, placed_by_discord_id, reward, reason, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        interaction.guildId,
        gid,
        name,
        interaction.user.id,
        reward,
        reason,
        imageUrl || null,
    ]);
    const bountyId = result.insertId;
    await logBountyAction(bountyId, 'created', interaction.user.id);
}
export async function listOpenBounties(interaction) {
    const guildId = interaction.guildId;
    await interaction.deferReply();
    const [rows] = await connection.execute(`SELECT id, target_name, reward, placed_by_discord_id, created_at, reason, image_url
       FROM bounties
       WHERE guild_id = ? AND status = 'active'
       ORDER BY created_at DESC`, [guildId]);
    if (!rows.length) {
        return interaction.editReply({
            content: '📭 There are currently **no active bounties** in this server.',
        });
    }
    const pageSize = 3;
    const pages = [];
    for (let i = 0; i < rows.length; i += pageSize) {
        pages.push(rows.slice(i, i + pageSize));
    }
    let page = 0;
    const buildEmbeds = (index) => {
        const pageRows = pages[index];
        // Page header embed
        const headerEmbed = new EmbedBuilder()
            .setTitle(`🎯 ${rows.length} Active Bounties`)
            .setDescription(`Page ${index + 1}/${pages.length}`)
            .setTimestamp();
        const embeds = [headerEmbed];
        // Each bounty gets its own small embed
        for (const b of pageRows) {
            const e = new EmbedBuilder()
                .setTitle(`#${b.id} — ${b.target_name}`)
                .setDescription(`💰 **${b.reward} gold**\n` +
                `Placed by: <@${b.placed_by_discord_id}>\n` +
                `<t:${Math.floor(new Date(b.created_at).getTime() / 1000)}:R>\n` +
                `${b.reason}`)
                .setTimestamp();
            if (b.image_url)
                e.setThumbnail(b.image_url);
            embeds.push(e);
        }
        return embeds;
    };
    const makeRow = (index) => {
        return new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId('bounty_prev')
            .setLabel('◀️ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(index === 0), new ButtonBuilder()
            .setCustomId('bounty_next')
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(index === pages.length - 1));
    };
    const reply = await interaction.editReply({
        embeds: buildEmbeds(page),
        components: pages.length > 1 ? [makeRow(page)] : [],
        allowedMentions: {
            users: Array.from(new Set(pages.flatMap((page) => page.map((b) => b.placed_by_discord_id)))),
        },
    });
    if (pages.length === 1)
        return;
    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
    });
    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id)
            return i.reply({
                content: 'This menu isn’t for you.',
                ephemeral: true,
            });
        if (i.customId === 'bounty_prev' && page > 0)
            page--;
        else if (i.customId === 'bounty_next' && page < pages.length - 1)
            page++;
        await i.update({
            embeds: buildEmbeds(page),
            components: [makeRow(page)],
        });
    });
    collector.on('end', async () => {
        try {
            await interaction.editReply({ components: [] });
        }
        catch { }
    });
}
/**
 * Completes a bounty — moderator mode or self mode
 */
export async function completeBounty(interaction) {
    const guildId = interaction.guildId;
    const bountyId = interaction.options.getString('bounty_id', false);
    const winner = interaction.options.getUser('winner', false);
    const imageUrl = interaction.options.getString('image_link', false);
    const nonDiscordWinner = interaction.options.getString('non_discord_winner', false);
    await interaction.deferReply({});
    if (winner && nonDiscordWinner) {
        return interaction.editReply({
            content: '⚠️ Please specify **only one** of `winner` or `non_discord_winner`.',
        });
    }
    if (!winner && !nonDiscordWinner) {
        return interaction.editReply({
            content: '⚠️ You must specify either a Discord winner or a non-Discord winner.',
        });
    }
    // ✅ Fetch bounty setter role config
    const [configRows] = await connection.execute(`SELECT bounty_role_id FROM bounty_config WHERE guild_id = ?`, [guildId]);
    const config = configRows[0];
    const bountyRoleId = config?.bounty_role_id;
    const isModerator = bountyRoleId &&
        'cache' in interaction.member.roles &&
        interaction.member.roles.cache.has(bountyRoleId);
    if (winner) {
        if (winner.id === interaction.user.id) {
            return interaction.followUp({
                content: `🚫 You cannot mark **yourself** as the winner of this bounty.`,
                ephemeral: true,
            });
        }
    }
    if (bountyId) {
        // 🧩 Moderator mode — requires bounty role
        if (!isModerator) {
            return interaction.editReply({
                content: '🚫 Only moderators can complete bounties by ID.',
            });
        }
        const [rows] = await connection.execute(`SELECT * FROM bounties WHERE id = ? AND guild_id = ?`, [bountyId, guildId]);
        const bounty = rows[0];
        if (!bounty) {
            return interaction.editReply({
                content: `❌ No bounty found with ID **${bountyId}**.`,
            });
        }
        if (bounty.status !== 'active') {
            return interaction.editReply({
                content: `⚠️ That bounty is already **${bounty.status}**.`,
            });
        }
        if (!winner && !nonDiscordWinner) {
            return interaction.editReply({
                content: `⚠️ You must specify a winner when completing by ID.`,
            });
        }
        const completedByName = winner ? winner.username : nonDiscordWinner;
        await updateCompletedBounty(interaction, bounty, completedByName, imageUrl, winner, guildId);
        return;
    }
    // 🧩 Self mode — show user’s own active bounties
    const [bounties] = await connection.execute(`SELECT id, target_name, reward, status, created_at
       FROM bounties
       WHERE placed_by_discord_id = ? AND guild_id = ? AND status = 'active'`, [interaction.user.id, guildId]);
    if (!bounties.length) {
        return interaction.editReply({
            content: '📭 You have no active bounties to complete.',
        });
    }
    const options = bounties.map((b) => new StringSelectMenuOptionBuilder()
        .setLabel(`${b.target_name} — ${b.reward} gold`)
        .setDescription(`Bounty ID: ${b.id} created: ${b.created_at.toLocaleDateString()}`)
        .setValue(String(b.id)));
    const menu = new StringSelectMenuBuilder()
        .setCustomId('select_bounty_complete')
        .setPlaceholder('Select a bounty to mark as complete')
        .addOptions(options);
    const row = new ActionRowBuilder().addComponents(menu);
    await interaction.editReply({
        content: 'Select a bounty to mark as completed:',
        components: [row],
    });
    const collector = interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 30_000,
    });
    collector?.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id)
            return i.reply({ content: 'This menu isn’t for you.', ephemeral: true });
        await i.deferUpdate();
        const selectedId = i.values[0];
        const [bountyRows] = await connection.execute(`SELECT * FROM bounties WHERE id = ? AND guild_id = ?`, [selectedId, guildId]);
        const bounty = bountyRows[0];
        if (!bounty) {
            return interaction.followUp({
                content: `❌ Could not find bounty #${selectedId}.`,
                ephemeral: true,
            });
        }
        const completedByName = winner ? winner.username : nonDiscordWinner;
        await updateCompletedBounty(interaction, bounty, completedByName, imageUrl, winner, guildId);
        collector.stop();
    });
    collector?.on('end', async () => {
        try {
            await interaction.editReply({ components: [] });
        }
        catch { }
    });
}
export async function updateCompletedBounty(interaction, bounty, completedByName, imageUrl, winner, guildId) {
    const completedByDiscordId = winner ? winner.id : null;
    // ✅ Update bounty record
    const [result] = await connection.execute(`UPDATE bounties
       SET status = 'completed',
           completed_by_discord_id = ?,
           completed_by_name = ?,
           completed_at = NOW(),
           completed_image_url = ?
     WHERE id = ? AND guild_id = ?`, [
        completedByDiscordId,
        completedByName,
        imageUrl ?? null,
        bounty.id,
        guildId,
    ]);
    // 🧩 Log action
    await logBountyAction(bounty.id, 'completed', interaction.user.id);
    // 🪙 Reward gold (Discord users only)
    if (winner) {
        await giveUserGold(winner.id, bounty.reward, guildId);
    }
    // 🖼️ Prepare embed
    const embed = new EmbedBuilder().setDescription(`🏆 Bounty **#${bounty.id}** on **${bounty.target_name}** has been completed!\nReward **${bounty.reward} gold** given to ${completedByName}.`);
    if (imageUrl)
        embed.setImage(imageUrl);
    // 📨 Edit reply
    await interaction.editReply({
        content: '',
        embeds: [embed],
    });
}
/**
 * Cancels a bounty
 */
export async function cancelBounty(interaction, bountyId) {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    // ✅ Fetch bounty
    const [rows] = await connection.execute(`
      SELECT placed_by_discord_id, status
      FROM bounties
      WHERE guild_id = ? AND id = ?
      `, [guildId, bountyId]);
    const bounty = rows[0];
    if (!bounty) {
        return interaction.editReply({
            content: `❌ No bounty found with ID **${bountyId}**.`,
        });
    }
    // ✅ Check admin privileges
    const member = await interaction.guild?.members.fetch(userId);
    const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator);
    // ✅ Validate ownership or admin permission
    if (bounty.placed_by_discord_id !== userId && !isAdmin) {
        return interaction.editReply({
            content: `🚫 You can only cancel bounties that **you created** unless you're an **administrator**.`,
        });
    }
    if (bounty.status !== 'active') {
        return interaction.editReply({
            content: `⚠️ This bounty is already **${bounty.status}** and cannot be cancelled.`,
        });
    }
    // ✅ Cancel bounty
    const [result] = await connection.execute(`
      UPDATE bounties 
      SET status = 'cancelled' 
      WHERE guild_id = ? AND id = ? AND status = 'active'
      `, [guildId, bountyId]);
    if (result.affectedRows === 0) {
        return interaction.editReply({
            content: `❌ No active bounty found with ID **${bountyId}**.`,
        });
    }
    // ✅ Log cancellation
    await connection.execute(`INSERT INTO bounty_log (bounty_id, action, actor_discord_id)
       VALUES (?, 'cancelled', ?)`, [bountyId, userId]);
    return interaction.editReply({
        content: `🗑️ Bounty **#${bountyId}** has been successfully cancelled.`,
    });
}
/**
 * Get leaderboard of gold
 */
export async function getGoldLeaderboard(guildId) {
    const [rows] = await connection.execute(`
    SELECT user_id, gold 
    FROM gold_balances
    WHERE guild_id = ?
    ORDER BY gold DESC
    LIMIT 20
    `, [guildId]);
    return rows;
}
/**
 * Get all bounties completed by a user
 */
export async function getUserBounties(guildId, userId) {
    const [rows] = await connection.execute(`
    SELECT id, target_name, reward, completed_at, completed_image_url
    FROM bounties
    WHERE guild_id = ? AND completed_by_discord_id = ?
    ORDER BY completed_at DESC
    `, [guildId, userId]);
    return rows;
}
/**
 * Adjust gold manually (moderator command)
 */
export async function adjustGold(guildId, userId, deltaGold) {
    await connection.execute(`
    INSERT INTO gold_balances (guild_id, user_id, gold)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE gold = gold + VALUES(gold)
    `, [guildId, userId, deltaGold]);
}
/**
 * Check if a user has the bounty setter role
 */
export async function hasBountySetterRole(guildId, member) {
    const [rows] = await connection.execute(`SELECT role_id FROM bounty_roles WHERE guild_id = ?`, [guildId]);
    if (!rows.length)
        return false;
    const roleId = rows[0].role_id;
    return member.roles.cache.has(roleId);
}
async function giveUserGold(discordId, amount, guildId) {
    await connection.execute(`INSERT INTO gold_balances (user_id, gold, guild_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE gold = gold + ?`, [discordId, amount, guildId, amount]);
}
/* -------------------------------------------------------------------------- */
/*                             DISPLAY / EMBED HELPERS                        */
/* -------------------------------------------------------------------------- */
/**
 * Builds an embed leaderboard for the guild
 */
export async function showLeaderboard(interaction) {
    await interaction.deferReply({});
    const guildId = interaction.guildId;
    const leaderboard = await getGoldLeaderboard(guildId);
    const perPage = 10;
    const totalPages = Math.ceil(leaderboard.length / perPage) || 1;
    let currentPage = 0;
    const generateEmbed = (page) => {
        const start = page * perPage;
        const pageEntries = leaderboard.slice(start, start + perPage);
        const fields = pageEntries.length
            ? pageEntries.map((entry, index) => ({
                name: `#${start + index + 1}`,
                value: `<@${entry.user_id}> — 💰 **${entry.gold.toLocaleString()} gold**`,
                inline: false,
            }))
            : [{ name: 'No entries yet', value: 'Start completing bounties!' }];
        return new EmbedBuilder()
            .setTitle('🏆 Bounty Leaderboard')
            .setDescription('Top gold holders in this server')
            .setColor(0xf1c40f)
            .addFields(fields)
            .setFooter({
            text: `Page ${page + 1} of ${totalPages}`,
        })
            .setTimestamp();
    };
    const generateButtons = () => {
        return new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0), new ButtonBuilder()
            .setCustomId('reset')
            .setLabel('🔄 Reset')
            .setStyle(ButtonStyle.Primary), new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages - 1));
    };
    const message = await interaction.editReply({
        embeds: [generateEmbed(currentPage)],
        components: [generateButtons()],
    });
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000, // 1 minute timeout
    });
    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            await i.reply({
                content: "You can't control this leaderboard.",
                ephemeral: true,
            });
            return;
        }
        switch (i.customId) {
            case 'prev':
                currentPage = Math.max(0, currentPage - 1);
                break;
            case 'next':
                currentPage = Math.min(totalPages - 1, currentPage + 1);
                break;
            case 'reset':
                currentPage = 0;
                break;
        }
        await i.update({
            embeds: [generateEmbed(currentPage)],
            components: [generateButtons()],
        });
    });
    collector.on('end', async () => {
        await interaction.editReply({
            embeds: [generateEmbed(currentPage)],
            components: [], // remove buttons after timeout
        });
    });
}
/**
 * Builds an embed showing all bounties completed by a specific user
 */
export async function showCompletedUserBounties(interaction) {
    const guildId = interaction.guildId;
    await interaction.deferReply();
    const userId = interaction.user.id;
    const bounties = await getUserBounties(guildId, userId);
    const embeds = bounties.map((bounty) => {
        const embed = {
            title: `${bounty.target_name}`,
            description: `Reward: 💰 **${bounty.reward}** — Completed: <t:${Math.floor(new Date(bounty.completed_at).getTime() / 1000)}:R>`,
        };
        if (bounty.completed_image_url) {
            embed.thumbnail = { url: String(bounty.completed_image_url) };
        }
        return embed;
    });
    await interaction.editReply({
        content: `Here are the completed bounties:`,
        embeds,
    });
}
async function logBountyAction(bountyId, action, actorDiscordId) {
    await connection.execute(`INSERT INTO bounty_log (bounty_id, action, actor_discord_id)
         VALUES (?, ?, ?)`, [bountyId, action, actorDiscordId]);
}
