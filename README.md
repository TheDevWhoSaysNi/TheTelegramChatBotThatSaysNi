# TheTelegramChatBotThatSaysNi

An open-source, scalable, and ethically-guarded Telegram chatbot framework built with Node.js, PostgreSQL, and Cloudflare.

## The Vision
This project was born out of a need for a "turnkey" AI solution for the Average Joe. Most AI tools are either overpriced enterprise SaaS or overly complex scripts. This provides a middle ground: a credit-gated, guardrailed chatbot that automates the repetative so you don't have to.

### Key Features:
* **Scalable Architecture:** Designed to scale from 1 to 1,000,000 users using Render's infrastructure.
* **Credit-Gate System:** A built-in "1 DM = 1 Credit" logic to make AI affordable (plan for approx. 1/10th of a cent per message).
* **Hardened Guardrails:** Pre-built logic to prevent toxicity, racism, and bot-abuse.
* **Encrypted Brains:** Supports encrypted database columns for System Prompts. Keep your secret sauce private while keeping your code open.
* **Cloudflare Optimized:** Custom domain support (e.g., suncoastservers.com) with proxied security.

---

## Tech Stack
* **Runtime:** Node.js (JavaScript)
* **Bot Framework:** grammY
* **Database:** PostgreSQL (Hosted on Render)
* **Frontend/UI:** Cloudflare Pages (Coming Soon)
* **Infrastructure:** Render (Web Service + DB)
* **DNS/Proxy:** Cloudflare

---

## Getting Started

### 0. Easy Method
Just sign up on [telegramchatbot.suncoastservers.com](https://telegramchatbot.suncoastservers.com) and connect your account.

### 1. Fork & Clone
If you want to build your own version of this bot, fork this repo! You can use the core logic to handle your own customer service or personal projects.

### 2. Environment Variables
Set these in Render (or in `.env` locally; copy from `api/.env.example`):
* **TELEGRAM_BOT_TOKEN** — From @BotFather. Powers your primary bot and the Telegram Login widget on the site.
* **DATABASE_URL** — PostgreSQL connection string (Render provides this if you add a Postgres DB and link it).
* **ENCRYPTION_KEY** — At least 32 characters. Used to encrypt stored bot tokens and "brains." Required if users save tokens via the hosted site.
* **SESSION_SECRET** — Random string for signing sessions. **Set this in production** (Render can auto-generate).
* **LLM_API_KEY** — (Optional) For future LLM integration.

### 3. Database Setup
Tables are created automatically on first run (`tg_user_auth`, `tg_bot_profiles`, `user_sessions`). Ensure `DATABASE_URL` is set (e.g. a Render PostgreSQL instance).

### 4. Deploying on Render
- **Already have a Web Service + Database?** Just connect this repo to your existing service. Set **Root Directory** to `api`, build `npm install`, start `npm start`. Your existing env vars (e.g. `DATABASE_URL`, `ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`) stay as-is.
- **Starting from scratch?** Use the repo’s `render.yaml` (Blueprint): in Render choose “New → Blueprint”, connect the repo, and it will create a new Web Service and PostgreSQL. Then set `TELEGRAM_BOT_TOKEN` and `ENCRYPTION_KEY` (32+ chars) in the service environment.
- For the **Telegram Login** widget on the hosted site, replace `YOUR_BOT_USERNAME` in `api/public/index.html` with your bot’s @username (e.g. `MyNiBot`).

---

## The "Secret Sauce" Policy
While the plumbing is open source, any algorithm/brains/prompting you create (the specific instructions that make the bot the way it is) is stored as encrypted data in the database, which keeps your intellectual property safe.

**Not tech savvy?** Just use mine for a minimal fee which keeps my bills paid. Visit [telegramchatbot.suncoastservers.com](https://telegramchatbot.suncoastservers.com) to use the hosted version for a small fee (1 DM = 1 credit = 1/10th of a cent).

---

## Ni

Ni!
