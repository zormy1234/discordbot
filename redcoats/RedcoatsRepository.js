import connection from '../database/connect.js';
export class RedcoatsRepository {
    static async getKnownNames(gid) {
        const [rows] = await connection.execute(`
            SELECT username
            FROM redcoats_player_names
            WHERE gid = ?
            ORDER BY last_seen DESC
            `, [gid]);
        return rows.map((x) => x.username);
    }
    static async createLinkRequest(discordUserId, gid, requestChannelId) {
        const [result] = await connection.execute(`
            INSERT INTO redcoats_link_requests (
                discord_user_id,
                gid,
                request_channel_id
            )
            VALUES (?, ?, ?)
            `, [discordUserId, gid, requestChannelId]);
        return result.insertId;
    }
    static async setApprovalMessage(requestId, messageId) {
        await connection.execute(`
            UPDATE redcoats_link_requests
            SET approval_message_id = ?
            WHERE id = ?
            `, [messageId, requestId]);
    }
    static async getPendingRequest(requestId) {
        const [rows] = await connection.execute(`
                SELECT *
                FROM redcoats_link_requests
                WHERE id = ?
                AND status = 'pending'
                `, [requestId]);
        return rows[0] ?? null;
    }
    static async approveRequest(requestId, reviewerId) {
        const [result] = await connection.execute(`
                UPDATE redcoats_link_requests
                SET
                    status = 'approved',
                    reviewed_by = ?,
                    reviewed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND status = 'pending'
                `, [reviewerId, requestId]);
        return result.affectedRows === 1;
    }
    static async rejectRequest(requestId, reviewerId) {
        const [result] = await connection.execute(`
                UPDATE redcoats_link_requests
                SET
                    status = 'rejected',
                    reviewed_by = ?,
                    reviewed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND status = 'pending'
                `, [reviewerId, requestId]);
        return result.affectedRows === 1;
    }
    static async createDiscordLink(discordUserId, gid, linkedBy) {
        await connection.execute(`
            INSERT INTO redcoats_discord_links (
                discord_user_id,
                gid,
                linked_by
            )
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                gid = VALUES(gid),
                linked_by = VALUES(linked_by),
                created_at = CURRENT_TIMESTAMP
            `, [discordUserId, gid, linkedBy]);
    }
    static async getDiscordLink(discordUserId) {
        const [rows] = await connection.execute(`
            SELECT *
            FROM redcoats_discord_links
            WHERE discord_user_id = ?
            `, [discordUserId]);
        return rows[0] ?? null;
    }
    static async removeDiscordLink(discordUserId) {
        const [result] = await connection.execute(`
            DELETE FROM redcoats_discord_links
            WHERE discord_user_id = ?
            `, [discordUserId]);
        return result.affectedRows > 0;
    }
}
