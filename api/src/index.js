require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const crypto = require("crypto");
const path = require("path");
const { Bot } = require("grammy");
const { query, initDb, pool } = require("./db");
const { encrypt, decrypt } = require("./utils/encryption");
const { callClaude } = require("./utils/claude");

const app = express();
const PORT = process.env.PORT || 3000;

// Open-source default prompt. Forkers can fill this with their own
// non-secret system instructions. Leave as "" to rely solely on
// per-user instructions and encrypted_secret_sauce from the database.
const OPEN_SOURCE_DEFAULT_PROMPT = "";

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

function attachBotErrorHandling(botInstance, label) {
  botInstance.catch((err) => {
    // Ignore harmless 409 conflicts when another long-polling instance was running
    if (err.error && err.error.error_code === 409) {
      console.warn(`Ni! ${label} received 409 conflict from Telegram (duplicate getUpdates). Ignoring.`);
      return;
    }
    console.error(`Ni! ${label} bot error:`, err);
  });
}

/**
 * Handle bot events
 * @param {{ chargeCredits?: boolean, ownerTelegramId?: number }} options
 *   - chargeCredits: whether to deduct credits (false for user-contributed bots)
 *   - ownerTelegramId: when set, profile/instructions are taken from this user (the bot owner), not the message sender
 */
async function setupBotHandlers(botInstance, options = {}) {
  const chargeCredits = options.chargeCredits !== undefined ? options.chargeCredits : true;
  const ownerTelegramId = options.ownerTelegramId;

  botInstance.command("start", async (ctx) => {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || "Guest";

    // User-contributed bot: only the owner gets "account" treatment; everyone else is just a chatter (no DB row, no credits message)
    if (ownerTelegramId != null) {
      if (telegramId === ownerTelegramId) {
        await ctx.reply("Ni! Your bot is set up. Anyone who messages this bot will get your Ni replies. (No credits used for this bot.)");
        return;
      }
      await ctx.reply("Ni! Send me a message.");
      return;
    }

    // Primary (hosted) bot: everyone who /start gets a row and sees credits
    const userRes = await query(
      `INSERT INTO tg_user_auth (telegram_id, username, credits) 
       VALUES ($1, $2, 100) ON CONFLICT (telegram_id) DO UPDATE SET username = $2
       RETURNING credits`, [telegramId, username]
    );
    await ctx.reply(`Ni! Account linked. Credits: ${userRes.rows[0].credits}`);
  });

  botInstance.on("message:text", async (ctx) => {
    const text = ctx.message.text?.trim();
    if (!text) return;

    // For user-contributed bots, use the owner's profile (who registered the bot). Otherwise use the message sender.
    const profileTelegramId = ownerTelegramId != null ? ownerTelegramId : ctx.from.id;

    try {
      // Fetch user profile, instructions, and credits (by profile owner for user bots, by sender for primary bot)
      const { rows } = await query(
        `SELECT u.credits,
                p.instructions,
                p.encrypted_secret_sauce
         FROM tg_user_auth u
         LEFT JOIN tg_bot_profiles p ON p.telegram_id = u.telegram_id
         WHERE u.telegram_id = $1`,
        [profileTelegramId]
      );

      if (!rows.length) {
        await ctx.reply("Ni! You are not registered yet. Send /start first.");
        return;
      }

      const user = rows[0];
      // For primary bot, charge the message sender. For user bots, we use owner's profile but don't charge.
      if (chargeCredits) {
        if (user.credits <= 0) {
          await ctx.reply("Ni! You are out of credits. Please top up to continue chatting.");
          return;
        }
      }

      // Compose system prompt
      const systemParts = [];
      if (OPEN_SOURCE_DEFAULT_PROMPT) systemParts.push(OPEN_SOURCE_DEFAULT_PROMPT);

      // Encrypted secret sauce per user/host (optional)
      if (user.encrypted_secret_sauce) {
        try {
          const secret = decrypt(user.encrypted_secret_sauce);
          if (secret) systemParts.push(secret);
        } catch {
          // ignore decryption issues for optional field
        }
      }

      // User instructions from profile (if any)
      if (user.instructions) {
        systemParts.push(`User profile instructions:\n${user.instructions}`);
      }

      const systemPrompt = systemParts.join("\n\n").trim() || undefined;

      // Call Claude
      const replyText = await callClaude({
        systemPrompt,
        userText: text,
      });

      if (!replyText) {
        await ctx.reply("Ni! Claude did not return a response. Please try again.");
        return;
      }

      // Decrement credits only for hosted (primary) bot usage (use profile owner for consistency)
      if (chargeCredits) {
        await query(
          "UPDATE tg_user_auth SET credits = GREATEST(credits - 1, 0) WHERE telegram_id = $1",
          [profileTelegramId]
        );
      }

      await ctx.reply(replyText);
    } catch (err) {
      console.error("Ni! Error handling message:", err);
      if (err.message && err.message.includes("ANTHROPIC_API_KEY")) {
        await ctx.reply("Ni! LLM is not configured. Ask the admin to set ANTHROPIC_API_KEY on the server.");
      } else {
        await ctx.reply("Ni! Something went wrong talking to the LLM. Please try again later.");
      }
    }
  });

  // Telegram Business: when someone DMs the account that connected this bot, reply on their behalf (no credits)
  botInstance.on("business_message", async (ctx) => {
    let conn;
    try {
      conn = await ctx.getBusinessConnection();
    } catch (e) {
      console.error("Ni! business_message getBusinessConnection:", e);
      return;
    }
    if (!conn || !conn.user) return;
    // Only reply to messages from customers, not when the business account owner types
    if (ctx.from.id === conn.user.id) return;

    const text = ctx.msg?.text?.trim();
    if (!text) return;

    const businessOwnerId = conn.user.id;

    try {
      const { rows } = await query(
        `SELECT p.instructions, p.encrypted_secret_sauce
         FROM tg_user_auth u
         LEFT JOIN tg_bot_profiles p ON p.telegram_id = u.telegram_id
         WHERE u.telegram_id = $1`,
        [businessOwnerId]
      );
      if (!rows.length) {
        await ctx.reply("Ni! This business account is not set up yet. Link it on the website first.");
        return;
      }

      const user = rows[0];
      const systemParts = [];
      if (OPEN_SOURCE_DEFAULT_PROMPT) systemParts.push(OPEN_SOURCE_DEFAULT_PROMPT);
      if (user.encrypted_secret_sauce) {
        try {
          const secret = decrypt(user.encrypted_secret_sauce);
          if (secret) systemParts.push(secret);
        } catch { /* ignore */ }
      }
      if (user.instructions) systemParts.push(`User profile instructions:\n${user.instructions}`);
      const systemPrompt = systemParts.join("\n\n").trim() || undefined;

      const replyText = await callClaude({ systemPrompt, userText: text });
      if (!replyText) {
        await ctx.reply("Ni! No response from the LLM. Try again.");
        return;
      }
      await ctx.reply(replyText);
    } catch (err) {
      console.error("Ni! Business message error:", err);
      if (err.message && err.message.includes("ANTHROPIC_API_KEY")) {
        await ctx.reply("Ni! LLM is not configured.");
      } else {
        await ctx.reply("Ni! Something went wrong. Please try again.");
      }
    }
  });
}

/**
 * Master Loop: Starts the primary bot and all user-contributed bots
 */
async function startAllBots() {
  // 1. Primary Environment Bot
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const mainBot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    // Hosted primary bot: charges credits because you pay for the LLM
    await setupBotHandlers(mainBot, { chargeCredits: true });
    attachBotErrorHandling(mainBot, "Primary");
    mainBot.start({
      allowed_updates: ["message", "edited_message", "business_message", "edited_business_message", "business_connection"],
    });
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
      // User-contributed bots: use owner's profile/instructions for all chatters; do not charge credits.
      await setupBotHandlers(userBot, { chargeCredits: false, ownerTelegramId: row.telegram_id });
      attachBotErrorHandling(userBot, `User ${row.telegram_id}`);
      userBot.start({
        allowed_updates: ["message", "edited_message", "business_message", "edited_business_message", "business_connection"],
      });
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
  if (!req.session.telegramId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { name, instructions, botUsername, botToken } = req.body || {};
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
      [req.session.telegramId, name || null, botUsername || null, instructions || null]
    );

    if (encryptedToken) {
      await query(`UPDATE tg_user_auth SET bot_token = $1 WHERE telegram_id = $2`, [encryptedToken, req.session.telegramId]);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Ni! save-profile error:", err);
    return res.status(500).json({
      error: "Failed to save profile. Check server logs.",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

/**
 * Session info for frontend
 */
app.get('/api/me', (req, res) => {
  res.json({
    loggedIn: !!req.session.telegramId || false,
  });
});

/**
 * Get current user's profile for editing (no token returned)
 */
app.get('/api/profile', async (req, res) => {
  if (!req.session.telegramId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { rows } = await query(
      `SELECT display_name, bot_username, instructions
       FROM tg_bot_profiles WHERE telegram_id = $1`,
      [req.session.telegramId]
    );
    const p = rows[0] || {};
    return res.json({
      name: p.display_name || "",
      botUsername: p.bot_username || "",
      instructions: p.instructions || "",
    });
  } catch (err) {
    console.error("Ni! get profile error:", err);
    return res.status(500).json({ error: "Failed to load profile." });
  }
});

/**
 * Public config for frontend (non-sensitive)
 */
app.get('/api/config', (req, res) => {
  res.json({
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || null
  });
});

// Simple HTML routes for static pages so paths like /connected work
app.get("/connected", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "connected.html"));
});

app.get("/profile", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "profile.html"));
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Server Initialization
initDb().then(() => {
  startAllBots();
  app.listen(PORT, () => console.log(`Ni! System v1.0 active on port ${PORT}`));
});