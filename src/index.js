require("dotenv").config();
const { Bot } = require("grammy");
const { query, initDb } = require("./db");

// 1. Initialize the Bot
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// 2. Identify and Link User Account
bot.command("start", async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || "Guest";

  try {
    // Check if user exists, otherwise create them with 10 free credits
    const userRes = await query(
      `INSERT INTO tg_user_auth (telegram_id, username, credits) 
       VALUES ($1, $2, 10) 
       ON CONFLICT (telegram_id) DO UPDATE SET username = $2
       RETURNING credits`,
      [telegramId, username]
    );

    const credits = userRes.rows[0].credits;
    
    await ctx.reply(
      `Ni! Welcome ${username}. Your account is linked.\n` +
      `Current Credits: ${credits}\n` +
      `Manage your bot at: https://telegramchatbot.suncoastservers.com`
    );
  } catch (err) {
    console.error("Link error:", err);
    await ctx.reply("Ni! There was an error linking your account.");
  }
});

// 3. Simple Message Listener (Placeholder for generateChatReply logic)
bot.on("message:text", async (ctx) => {
  // TODO integrate the exuisting 2000+ line logic here later
  await ctx.reply("I hear you! Ni!");
});

// Start the server
initDb().then(() => {
  bot.start();
  console.log("The TelegramChatBotThatSaysNi is live!");
});
