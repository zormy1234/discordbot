import { SlashCommandBuilder, } from "discord.js";
import connection from '../database/connect.js';
export const data = new SlashCommandBuilder()
    .setName("fix_full_kd")
    .setDescription("Recalculate full_avg_kd for all totals and daily tables.");
export async function execute(interaction) {
    await interaction.reply("🔧 Starting KD backfill…");
    try {
        const [totalResult] = await connection.execute(`
      UPDATE ships_totals
      SET full_avg_kd =
        CASE
          WHEN total_deaths = 0 THEN total_kills
          ELSE total_kills / total_deaths
        END
      `);
        // @ts-ignore  - mysql2 types do not expose affectedRows
        const totalsUpdated = totalResult.affectedRows ?? 0;
        await interaction.followUp(`✅ Updated **${totalsUpdated}** rows in *ships_totals*.`);
        const [dailyResult] = await connection.execute(`
      UPDATE ships_daily_totals
      SET full_avg_kd =
        CASE
          WHEN total_deaths = 0 THEN total_kills
          ELSE total_kills / total_deaths
        END
      `);
        // @ts-ignore
        const dailyUpdated = dailyResult.affectedRows ?? 0;
        await interaction.followUp(`✅ Updated **${dailyUpdated}** rows in *ships_daily_totals*.`);
        await interaction.followUp(`🎉 **KD backfill complete!**`);
    }
    catch (err) {
        console.error("KD Backfill Error:", err);
        await interaction.followUp(`❌ Error occurred while updating KD values.`);
    }
}
