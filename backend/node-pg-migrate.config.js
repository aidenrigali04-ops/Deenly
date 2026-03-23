const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  direction: "up",
  migrationsTable: "pgmigrations",
  dir: "migrations",
  databaseUrl: process.env.DATABASE_URL,
  ignorePattern: ".*\\.map",
  count: Infinity
};
