export interface ParsedPlayerResult {
  rank: number;
  gid: string;
  clan: string | null;
  username: string;
  score: number;
  kills: number;
  playerKills: number;
  deaths: number;
}

function slice(line: string, start: number, end?: number) {
  return line.slice(start, end).trim();
}

export function parseRedcoatsMessage(content: string): ParsedPlayerResult[] {
  const lines = content
    .split('\n')
    .map((x) => x.replace(/\r/g, ''))
    .filter(Boolean);

  const results: ParsedPlayerResult[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('Rank')) {
      continue;
    }

    if (/^-+$/.test(trimmed)) {
      continue;
    }

    // rank gid [optional clan] username score kills playerKills deaths
    const parts = trimmed.split(/\s+/);

    if (parts.length < 7) {
      continue;
    }

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

    if (!gid || !username) {
      continue;
    }

    results.push({
      rank,
      gid,
      clan,
      username,
      score,
      kills,
      playerKills,
      deaths,
    });
  }

  return results;
}
