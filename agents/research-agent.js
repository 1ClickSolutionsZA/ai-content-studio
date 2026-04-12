import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const MODEL_SONNET = "claude-sonnet-4-6";

async function callClaude(model, system, user, maxTokens) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens || 800,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  return response.content[0].text;
}

async function callTavily(query) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 3,
      include_answer: true,
      include_raw_content: false,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.answer || data.results.map(r => r.content).join(" ") || "";
}

async function run() {
  console.log("=== Research Agent Starting ===");

  console.log("Step 1/6: Generating queries [haiku]...");
  const q1 = await callClaude(
    MODEL_HAIKU,
    "Output only valid JSON. No markdown. No explanation.",
    "Generate 8 search queries for AI coding tools course market. Target: non-technical solopreneurs learning Claude Code, Cursor, Lovable, Bolt. Return ONLY this JSON: {\"course_queries\":[\"q1\",\"q2\",\"q3\",\"q4\"],\"channel_queries\":[\"q5\",\"q6\",\"q7\",\"q8\"]}",
    300
  );
  const queries = JSON.parse(q1.replace(/```json|```/g, "").trim());
  console.log("Step 1 done");

  console.log("Step 2/6: Running Tavily searches...");
  const allQ = [...queries.course_queries, ...queries.channel_queries];
  const searchData = [];
  for (const q of allQ) {
    try {
      const result = await callTavily(q);
      searchData.push({ query: q, result: result.slice(0, 400) });
      console.log("  OK: " + q);
    } catch (e) {
      searchData.push({ query: q, result: "No result" });
      console.log("  FAIL: " + q);
    }
  }
  console.log("Step 2 done");

  console.log("Step 3/6: Summarising [haiku]...");
  const rawData = searchData.map(d => "Q: " + d.query + " A: " + d.result).join(" | ");
  const summary = await callClaude(
    MODEL_HAIKU,
    "You are a research summariser. Be concise and factual.",
    "Summarise into key findings on pricing, formats, gaps, audience. Max 300 words. Data: " + rawData,
    400
  );
  console.log("Step 3 done");

  console.log("Step 4/6: Writing Blueprint [sonnet]...");
  const blueprint = await callClaude(
    MODEL_SONNET,
    "You are a sharp online business strategist. Be specific and actionable.",
    "Write a Product Blueprint for an AI coding tools content studio. Include product tiers, pricing in USD and ZAR, target customer, top 3 competitor gaps. Research: " + summary,
    900
  );
  console.log("Step 4 done");

  console.log("Step 5/6: Writing Marketing Report [sonnet]...");
  const channels = await callClaude(
    MODEL_SONNET,
    "You are a lean growth strategist.",
    "Write a Marketing Channel Report for a solo AI content studio. Top 3 channels by ROI, content strategy, cold email approach, 30-day action plan. Research: " + summary,
    900
  );
  console.log("Step 5 done");

  console.log("Step 6/6: Pricing Strategy [haiku]...");
  const pricing = await callClaude(
    MODEL_HAIKU,
    "Output a clear pricing strategy. Concise.",
    "Write a lean pricing strategy for a solo AI content studio. Retainer tiers, digital product prices, lead magnet, upsell path. USD and ZAR. Research: " + summary,
    400
  );
  console.log("Step 6 done");

  const biDoc = {
    generatedAt: new Date().toISOString(),
    summary,
    blueprint,
    channels,
    pricing,
  };

  fs.writeFileSync(path.join("outputs", "research.json"), JSON.stringify(biDoc, null, 2));
  console.log("=== DONE: outputs/research.json ===");
  console.log("\n--- SUMMARY ---\n" + summary);
}

run().catch(console.error);
