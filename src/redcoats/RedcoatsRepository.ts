import { ResultSetHeader, RowDataPacket } from 'mysql2';
import connection from '../database/connect.js';

export interface LinkRequest extends RowDataPacket {
  id: number;
  discord_user_id: string;
  gid: string;
  request_channel_id: string;
  approval_message_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
}

interface DiscordLink extends RowDataPacket {
  discord_user_id: string;
  gid: string;
  linked_by: string;
}

export class RedcoatsRepository {
  static async getKnownNames(gid: string): Promise<string[]> {
    const [rows] = await connection.execute<any[]>(
      `
            SELECT username
            FROM redcoats_player_names
            WHERE gid = ?
            ORDER BY last_seen DESC
            `,
      [gid]
    );

    return rows.map((x) => x.username);
  }

  static async createLinkRequest(
    discordUserId: string,
    gid: string,
    requestChannelId: string
  ): Promise<number> {
    const [result] = await connection.execute<ResultSetHeader>(
      `
            INSERT INTO redcoats_link_requests (
                discord_user_id,
                gid,
                request_channel_id
            )
            VALUES (?, ?, ?)
            `,
      [discordUserId, gid, requestChannelId]
    );

    return result.insertId;
  }

  static async setApprovalMessage(requestId: number, messageId: string) {
    await connection.execute(
      `
            UPDATE redcoats_link_requests
            SET approval_message_id = ?
            WHERE id = ?
            `,
      [messageId, requestId]
    );
  }

  static async getPendingRequest(
    requestId: number
  ): Promise<LinkRequest | null> {
    const [rows] = await connection.execute<LinkRequest[]>(
      `
                SELECT *
                FROM redcoats_link_requests
                WHERE id = ?
                AND status = 'pending'
                `,
      [requestId]
    );

    return rows[0] ?? null;
  }

  static async approveRequest(
    requestId: number,
    reviewerId: string
  ): Promise<boolean> {
    const [result] = await connection.execute<ResultSetHeader>(
      `
                UPDATE redcoats_link_requests
                SET
                    status = 'approved',
                    reviewed_by = ?,
                    reviewed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND status = 'pending'
                `,
      [reviewerId, requestId]
    );

    return result.affectedRows === 1;
  }

  static async rejectRequest(
    requestId: number,
    reviewerId: string
  ): Promise<boolean> {
    const [result] = await connection.execute<ResultSetHeader>(
      `
                UPDATE redcoats_link_requests
                SET
                    status = 'rejected',
                    reviewed_by = ?,
                    reviewed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                AND status = 'pending'
                `,
      [reviewerId, requestId]
    );

    return result.affectedRows === 1;
  }

  static async createDiscordLink(
    discordUserId: string,
    gid: string,
    linkedBy: string
  ) {
    await connection.execute(
      `
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
            `,
      [discordUserId, gid, linkedBy]
    );
  }

  static async getDiscordLink(
    discordUserId: string
  ): Promise<DiscordLink | null> {
    const [rows] = await connection.execute<DiscordLink[]>(
      `
            SELECT *
            FROM redcoats_discord_links
            WHERE discord_user_id = ?
            `,
      [discordUserId]
    );

    return rows[0] ?? null;
  }

  static async removeDiscordLink(discordUserId: string): Promise<boolean> {
    const [result] = await connection.execute<ResultSetHeader>(
      `
            DELETE FROM redcoats_discord_links
            WHERE discord_user_id = ?
            `,
      [discordUserId]
    );

    return result.affectedRows > 0;
  }
}
