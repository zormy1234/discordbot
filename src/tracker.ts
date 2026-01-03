import mysql from "mysql2/promise";

interface ServerInfo {
  serverName: string;
  playerCount: number;
}
import connection from './database/connect.js';

const URL = "https://yp3d.com/ships3d-game/list-servers/";

async function trackPlayers(): Promise<void> {
  try {
    const res = await fetch(URL);
    const servers = (await res.json()) as ServerInfo[];

    const trader2 = servers.find(
      (s) => s.serverName === "Trader #2"
    );

    if (!trader2) {
      console.warn("Trader #2 not found");
      return;
    }

    await connection.execute(
      `INSERT INTO trader2_players (timestamp, playerCount)
       VALUES (?, ?)`,
      [Date.now(), trader2.playerCount]
    );

  } catch (err) {
    console.error("Tracker error:", err);
  }
}

// run immediately
trackPlayers();

// run every minute
setInterval(trackPlayers, 60_000);
