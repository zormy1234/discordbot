# discordbot

You need a .env file with these variables to run this 

```
DISCORD_TOKEN=
CLIENT_ID=
BOT_OWNER=

# logs DB
LOG_DB_HOST=
LOG_DB_PORT=3306
LOG_DB_USER=
LOG_DB_PASS=
LOG_DB_NAME=s190398_tankslog

# clan-config DB (used by /setup lookups)
CLAN_DB_USERNAME=
CLAN_DB_PASSWORD=
DB_HOST=
DB_PORT=
```

The code is developed in typescript, in the src file, and converted to js before commiting because sparkedhost requires that. Its messy. 
<br>
Use npx tsc to generate the js files 