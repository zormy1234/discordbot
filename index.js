// const dotenv = require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');

// Create a new Discord client with message intent 
const client = new Client({ 
    intents: [ 
        GatewayIntentBits.Guilds,  
        GatewayIntentBits.GuildMessages,  
        GatewayIntentBits.MessageContent] 
  }); 
  
  // Bot is ready 
  client.once('ready', () => { 
    console.log(`🤖 Logged in as ${client.user.tag}`); 
  }); 
  
  // Listen and respond to messages 
  client.on('messageCreate', message => { 
  
    // Ignore messages from bots 
    if (message.author.bot) return; 
  
    // Respond to a specific message 
    if (message.content.toLowerCase() === 'hello') { 
      message.reply('Hi there! 👋 I am your friendly bot.'); 
    } 
  });   
  
  // Log in to Discord using token from .env 
  client.login(process.env.DISCORD_TOKEN); 