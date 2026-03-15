const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

if (!DATABASE_URL) {
  throw new Error("Ni! DATABASE_URL is missing. Set it in Render environment variables.");
}

async function query(text, params) {
  return pool.query(text, params);
}

async function initDb() {
  // Main User & Auth Table
  await query(`
    CREATE TABLE IF NOT EXISTS tg_user_auth (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      credits INTEGER DEFAULT 10,
      secret_unlocked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Bot Configuration Table (Encrypted)
  await query(`
    CREATE TABLE IF NOT EXISTS tg_bot_profiles (
      telegram_id BIGINT PRIMARY KEY REFERENCES tg_user_auth(telegram_id),
      display_name TEXT,
      instructions TEXT,
      encrypted_secret_sauce TEXT, 
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("Database initialized. All tables are ready for Ni!");
}

module.exports = { query, initDb };
