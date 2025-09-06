import { createPool } from 'better-sqlite3'

const connection = createPool({
    host: "db-eu-01.sparkedhost.us:3306",
    user: process.env.CLAN_DB_USERNAME,
    password: process.env.CLAN_DB_USERNAME,
    database: "s190398_clan_details"
})

export default connection