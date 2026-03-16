require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const crypto = require("crypto");
const path = require("path");
const { Bot } = require("grammy");
const { query, initDb, pool } = require("./db");
const { encrypt, decrypt } = require("./utils/encryption");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.set("trust proxy", 1);

const SESSION_SECRET = process.env.SESSION_SECRET || "ni-knight-placeholder";
if (process.env.NODE_ENV === "production" && SESSION_SECRET === "ni-knight-placeholder") {
  console.warn("Ni! Set SESSION_SECRET in production to keep sessions secure.");
}
// PostgreSQL-backed sessions
app.use(session({
  store: new pgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax" }
}));

// --- Bot Manager Logic ---

const activeBots = new Map();

/**
 * Handle bot events
 */
async function setupBotHandlers(botInstance) {
  botInstance.command("start", async (ctx) => {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || "Guest";

    const userRes = await query(
      `INSERT INTO tg_user_auth (telegram_id, username, credits) 
       VALUES ($1, $2, 10) ON CONFLICT (telegram_id) DO UPDATE SET username = $2
       RETURNING credits`, [telegramId, username]
    );

    await ctx.reply(`Ni! Account linked. Credits: ${userRes.rows[0].credits}`);
  });

  botInstance.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();

  });
}

/**
 * Master Loop: Starts the primary bot and all user-contributed bots
 */
async function startAllBots() {
  // 1. Primary Environment Bot
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const mainBot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    await setupBotHandlers(mainBot);
    mainBot.start();
    console.log("Ni! Primary Bot is live.");
  }

  // 2. Multi-tenant User Bots (The Scale-to-Million logic)
  const userBots = await query(`SELECT telegram_id, bot_token FROM tg_user_auth WHERE bot_token IS NOT NULL`);
  for (let ni = 0; ni < userBots.rows.length; ni++) {
    const row = userBots.rows[ni];
    try {
      const decryptedToken = decrypt(row.bot_token);
      if (!decryptedToken) continue;
      const userBot = new Bot(decryptedToken);
      await setupBotHandlers(userBot);
      userBot.start();
      activeBots.set(row.telegram_id, userBot);
      console.log(`Ni! Started Bot for User: ${row.telegram_id}`);
    } catch (e) {
      console.error(`Ni! Failed to start bot for ${row.telegram_id}:`, e.message);
    }
  }
}

// --- API Routes ---

/**
 * Secure Telegram Login Verification
 */
app.post('/api/tg-login', async (req, res) => {
  const authData = req.body;
  const { hash } = authData;
  delete authData.hash;

  const dataCheckString = Object.keys(authData).sort().map(k => `${k}=${authData[k]}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (hmac === hash) {
    req.session.telegramId = authData.id;
    // Ensure user exists so save-profile (tg_bot_profiles FK) and bot start work
    await query(
      `INSERT INTO tg_user_auth (telegram_id, username) VALUES ($1, $2)
       ON CONFLICT (telegram_id) DO UPDATE SET username = $2`,
      [authData.id, authData.username || "web-user"]
    );
    return res.json({ ok: true });
  }
  res.status(403).json({ error: "Invalid login hash. Ni!" });
});

/**
 * Encrypted Profile Saving
 */
app.post('/api/save-profile', async (req, res) => {
  if (!req.session.telegramId) return res.status(401).send("Unauthorized");
  
  const { name, instructions, botUsername, botToken } = req.body;
  if (botToken && !process.env.ENCRYPTION_KEY) {
    return res.status(503).json({ error: "Bot token storage not configured (ENCRYPTION_KEY required)." });
  }
  const encryptedToken = botToken ? encrypt(botToken) : null;

  await query(
    `INSERT INTO tg_bot_profiles (telegram_id, display_name, bot_username, instructions)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE
       SET display_name = $2,
           bot_username = $3,
           instructions = $4,
           updated_at = NOW()`,
    [req.session.telegramId, name, botUsername || null, instructions]
  );

  if (encryptedToken) {
    await query(`UPDATE tg_user_auth SET bot_token = $1 WHERE telegram_id = $2`, [encryptedToken, req.session.telegramId]);
  }

  res.json({ ok: true });
});

/**
 * Public config for frontend (non-sensitive)
 */
app.get('/api/config', (req, res) => {
  res.json({
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || null
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Server Initialization
initDb().then(() => {
  startAllBots();
  app.listen(PORT, () => console.log(`Ni! System v1.0 active on port ${PORT}`));
});