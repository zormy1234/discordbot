import { Client, Collection, Events, GatewayIntentBits, REST, Routes, } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handleWinlogs from './handle_winlogs/ReceiveWinlogs.js';
import './database/PrivateDbTables.js';
import './database/SharedDbTables.js';
import "./tracker.js";
// __dirname replacement for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Create a new Discord client with intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});
// Add commands collection
client.commands = new Collection();
// Bot is ready
client.once(Events.ClientReady, () => {
    console.log(`🤖 Logged in as ${client.user?.tag}`);
});
const foldersPath = path.join(__dirname, 'commands');
// Read all command files
const commandFiles = fs
    .readdirSync(foldersPath)
    .filter((file) => file.endsWith('.js') || file.endsWith('.ts'));
// Load each command
for (const file of commandFiles) {
    const filePath = path.join(foldersPath, file);
    const command = (await import(`file://${filePath}`));
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
    else {
        console.warn(`[WARNING] The command at ${filePath} is missing "data" or "execute".`);
    }
}
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
try {
    console.log(`Started refreshing ${client.commands.size} application (/) commands.`);
    const jsonCommands = client.commands.map((cmd) => cmd.data.toJSON());
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: jsonCommands,
    });
    console.log(`✅ Registered ${jsonCommands.length} commands`);
}
catch (error) {
    console.error('❌ Failed to register commands:', error);
}
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const command = client.commands.get(interaction.commandName);
    if (!command)
        return;
    try {
        await command.execute(interaction);
    }
    catch (error) {
        console.error(error);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: '⚠️ There was an error executing this command.',
            });
        }
        else {
            await interaction.reply({
                content: '⚠️ There was an error executing this command.',
                ephemeral: true,
            });
        }
    }
});
client.on('error', (err) => {
    console.error('[Discord Client Error]', err);
});
client.rest.on('rateLimited', (info) => {
    console.warn('[Rate Limited]', info);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught exception:', err.stack || err);
});
// Register forwarder
handleWinlogs(client);
// Log in
client.login(process.env.DISCORD_TOKEN);
