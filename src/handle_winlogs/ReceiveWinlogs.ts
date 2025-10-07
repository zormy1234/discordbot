import { Client, Message } from 'discord.js';
import { storeInDb } from './StoreWinLogs.js';
import forwardWinlogs from './ForwardWinLogs.js';

export interface ParsedLine {
  rank: number;
  gid: string;
  clan: string | undefined;
  username: string;
  score: number;
  kills: number;
  deaths: number;
}

export interface RawWithParsed {
  raw: String;
  parsed: ParsedLine | null;
}

export function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Match last three numeric columns (score, kills, deaths), allowing commas
  const match = trimmed.match(/(\d{1,3}(?:,\d{3})*)\s+(\d+)\s+(\d+)$/);
  if (!match) return null;

  const [_, scoreStr, killsStr, deathsStr] = match;

  const score = parseInt(scoreStr.replace(/,/g, ''), 10);
  const kills = parseInt(killsStr, 10);
  const deaths = parseInt(deathsStr, 10);

  // Remove the numeric columns from the end
  const rest = trimmed.slice(0, match.index).trim();

  // First two columns: rank and gid
  const parts = rest.split(/\s+/);
  if (parts.length < 2) return null;

  const rank = parseInt(parts[0], 10);
  const gid = parts[1];

  // Everything in between is clan (optional) + username
  let clan = '';
  let username = '';

  if (parts.length === 3) {
    // No clan
    username = parts[2];
  } else if (parts.length >= 4) {
    clan = parts[2];
    username = parts.slice(3).join(' ');
  }

  return { rank, gid, clan, username, score, kills, deaths };
}

export default function handleWinlogs(client: Client) {
  client.on('messageCreate', async (message: Message) => {
    if (message.author.id === client.user?.id) return;

    if (
      message.guild?.id !== process.env.WINLOGS_DISCORD ||
      message.channel.id !== process.env.WINLOGS_CHANNEL
    )
      return;

    const content = message.content.replace(/```/g, '');
    const lines: RawWithParsed[] = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .flatMap((l) => {
        const parsed = parseLine(l);
        return { raw: l, parsed: parsed };
      })
      .filter((parsedWithLine) => parsedWithLine.parsed != undefined);

    if (lines.length == 0) {
      return;
    }

    console.log(
      `recieved message on channel starting with line ${lines[0].raw}`
    );

    await forwardWinlogs(client, lines);
    await storeInDb(lines, message);
  });
}
