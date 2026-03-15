# The Telegram Chatbot That Says Ni

An open-source, scalable, and ethically-guarded Telegram chatbot framework built with Node.js, PostgreSQL, and Cloudflare.

## The Vision
This project was born out of a need for a "turnkey" AI solution for the Average Joe. Most AI tools are either overpriced enterprise SaaS or overly complex scripts. This provides a middle ground: a credit-gated, guardrailed chatbot that automates the repetative so you don't have to.

### Key Features:
* **Scalable Architecture:** Designed to scale from 1 to 1,000,000 users using Render's infrastructure.
* **Credit-Gate System:** A built-in "1 DM = 1 Credit" logic to make AI affordable (plan for approx. 1/10th of a cent per message).
* **Hardened Guardrails:** Pre-built logic to prevent toxicity, racism, and bot-abuse.
* **Encrypted Brains:** Supports encrypted database columns for System Prompts—keep your secret sauce private while keeping your code open.
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
To run this, you will need to set the following on Render:
* `TELEGRAM_BOT_TOKEN`: Get this from @BotFather.
* `DATABASE_URL`: Your PostgreSQL connection string.
* `ENCRYPTION_KEY`: A 32-character string to decrypt the "brains" in your DB.
* `LLM_API_KEY`: API key from LLM provider of your choice.

### 3. Database Setup
Run the provided SQL scripts in the `/db` folder to initialize the `users` and `credits` tables.

---

## The "Secret Sauce" Policy
While the plumbing is open source, any algorithm/brains/prompting you create (the specific instructions that make the bot the way it is) is stored as encrypted data in the database, which keeps your intellectual property safe.

**Not tech savvy?** Just use mine for a minimal fee which keeps my bills paid. Visit [telegramchatbot.suncoastservers.com](https://telegramchatbot.suncoastservers.com) to use the hosted version for a small fee (1 DM = 1 credit = 1/10th of a cent).

---

## Ni

Ni!
