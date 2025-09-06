import { Client, GatewayIntentBits } from 'discord.js';

// Create a new Discord client with message intent
const client = new Client({
  intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Bot is ready
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(foldersPath)
  .filter((file) => file.endsWith('.js'));

// Load each command
for (const file of commandFiles) {
  const filePath = path.join(foldersPath, file);
  const command = require(filePath);

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(
      `[WARNING] The command at ${filePath} is missing "data" or "execute".`
    );
  }
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
