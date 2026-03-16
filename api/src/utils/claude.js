const axios = require("axios");

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Ni! ANTHROPIC_API_KEY is not set. Add it to your environment to enable Claude.");
  }
  return axios.create({
    baseURL: ANTHROPIC_BASE_URL,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
  });
}

async function callClaude({ systemPrompt, userText }) {
  const client = getClient();
  const model = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

  const response = await client.post("/messages", {
    model,
    max_tokens: 512,
    temperature: 0.3,
    system: systemPrompt || undefined,
    messages: [
      {
        role: "user",
        content: userText,
      },
    ],
  });

  const parts = response.data?.content || [];
  return parts.map((p) => p.text || "").join("\n").trim();
}

module.exports = { callClaude };

