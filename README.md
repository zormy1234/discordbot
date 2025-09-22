# discordbot

You need a .env file with these variables to run this 

```
DISCORD_TOKEN=
CLIENT_ID=
BOT_OWNER=
# The place the logs are read from, the bot needs to be in that server for it to read the logs. 
# Create a test channel somewhere and paste logs in that channel to test
WINLOGS_DISCORD=
WINLOGS_CHANNEL=

# logs DB
LOG_DB_HOST=
LOG_DB_PORT=
LOG_DB_USER=
LOG_DB_PASS=
LOG_DB_NAME=

# clan-config DB (used by /setup lookups)
CLAN_DB_USERNAME=
CLAN_DB_PASSWORD=
DB_HOST=
DB_PORT=
CLAN_DB_NAME=

```

The code is developed in typescript, in the src file, and converted to js before commiting because sparkedhost requires that. Its messy. 
<br>
Use npx tsc to generate the js files 