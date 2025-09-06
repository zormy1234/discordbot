import {
  Client,
  Collection,
  ContextMenuCommandBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  ApplicationCommandType,
} from 'discord.js';

import './database/ClanDatabaseTables.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

// __dirname replacement for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a new Discord client with message intent
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,          
    GatewayIntentBits.GuildMessages,  
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers   
  ],
});

// Bot is ready
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');

// Read all command files
const commandFiles = fs
  .readdirSync(foldersPath)
  .filter((file) => file.endsWith('.js'));

// Load each command
for (const file of commandFiles) {
  const filePath = path.join(foldersPath, file);

  // Use dynamic import for ES modules
  const command = await import(`file://${filePath}`);

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(
      `[WARNING] The command at ${filePath} is missing "data" or "execute".`
    );
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
try {
  console.log(
    `Started refreshing ${client.commands.size} application (/) commands.`
  );

  const commands = [];
  for (const command of client.commands.values()) {
    commands.push(command.data.toJSON());
  }
  // // Global commands (take ~1hr to propagate)
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commands,
  });
  console.log(`Registered ${commands.length} commands`);

  // // // For development, register in one guild (instant)
  // // await rest.put(
  // //   Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  // //   { body: commands },
  // // );
} catch (error) {
  console.error(error);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: 'There was an error executing this command.',
      ephemeral: true,
    });
  }
});

// Log in to Discord using token from .env
client.login(process.env.DISCORD_TOKEN);
