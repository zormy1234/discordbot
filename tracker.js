import mysql from "mysql2/promise";
const URL = "https://yp3d.com/ships3d-game/list-servers/";
// 🔒 put these in env vars in production
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5
});
async function trackPlayers() {
    try {
        const res = await fetch(URL);
        const servers = (await res.json());
        const trader2 = servers.find((s) => s.serverName === "Trader #2");
        if (!trader2) {
            console.warn("Trader #2 not found");
            return;
        }
        await pool.execute(`INSERT INTO trader2_players (timestamp, playerCount)
       VALUES (?, ?)`, [Date.now(), trader2.playerCount]);
        console.log(`[${new Date().toISOString()}] Saved: ${trader2.playerCount}`);
    }
    catch (err) {
        console.error("Tracker error:", err);
    }
}
// run immediately
trackPlayers();
// run every minute
setInterval(trackPlayers, 60_000);
