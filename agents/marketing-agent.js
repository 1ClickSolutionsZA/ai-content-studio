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

async function run() {
  console.log("=== Marketing Agent Starting ===");

  // Load inputs
  const research = JSON.parse(fs.readFileSync(path.join("outputs", "research.json"), "utf8"));
  const config = JSON.parse(fs.readFileSync(path.join("config", "business-config.json"), "utf8"));
  console.log("Inputs loaded: research.json + business-config.json");

  const audience = config.targetAudience.primary || config.targetAudience;
  const tiers = config.productTiers.map(t => t.name + " $" + t.priceUSD + "/mo").join(", ");

  // STEP 1 — Content strategy (Sonnet)
  console.log("Step 1/3: Generating 30-day content strategy [sonnet]...");
  const strategyRaw = await callClaude(
    MODEL_SONNET,
    "You are a LinkedIn growth strategist for B2B solopreneurs. Output valid JSON only. No markdown fences. No explanation.",
    `Create a 30-day LinkedIn content calendar for "${config.businessName}".

Context:
- Target: ${audience}
- Products: ${tiers}
- Lead magnet: ${config.leadMagnet.name}
- Channels insight: ${research.channels.slice(0, 800)}

Output a JSON array of 30 objects, each with:
- day (number 1-30)
- theme (string: one of "authority", "storytelling", "education", "engagement", "promotion")
- hook (string: the opening line of the post, punchy and scroll-stopping)
- topic (string: 1-sentence description of the post content)
- cta (string: the call-to-action at the end)

Mix themes roughly: 30% education, 25% authority, 20% storytelling, 15% engagement, 10% promotion.
Posts should reference AI tools (Lovable, Cursor, Claude, Bolt) and building without code.`,
    4000
  );

  let strategy;
  try {
    strategy = JSON.parse(strategyRaw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.error("Strategy JSON parse failed, retrying with repair...");
    const repaired = await callClaude(
      MODEL_HAIKU,
      "Fix this broken JSON array. Output ONLY valid JSON. No explanation.",
      strategyRaw,
      4000
    );
    strategy = JSON.parse(repaired.replace(/```json|```/g, "").trim());
  }
  console.log("Step 1 done — " + strategy.length + " days planned");

  // STEP 2 — Generate LinkedIn posts in batches (Haiku)
  console.log("Step 2/3: Writing 30 LinkedIn posts [haiku]...");
  const linkedinPosts = [];
  const batchSize = 6;
  for (let i = 0; i < strategy.length; i += batchSize) {
    const batch = strategy.slice(i, i + batchSize);
    const promises = batch.map(async (day) => {
      const post = await callClaude(
        MODEL_HAIKU,
        "Write a LinkedIn post for a solopreneur building an AI education brand. Be conversational, direct, use line breaks for readability. No hashtags. No emojis. Keep under 200 words.",
        `Write a LinkedIn post for Day ${day.day}.
Theme: ${day.theme}
Hook (use as opening line): ${day.hook}
Topic: ${day.topic}
CTA: ${day.cta}
Business: ${config.businessName} — ${config.tagline}
Target audience: ${audience}`,
        400
      );
      return { day: day.day, theme: day.theme, hook: day.hook, post };
    });
    const results = await Promise.all(promises);
    linkedinPosts.push(...results);
    console.log("  OK: Days " + (i + 1) + "-" + Math.min(i + batchSize, strategy.length) + " written");
  }
  linkedinPosts.sort((a, b) => a.day - b.day);
  console.log("Step 2 done — " + linkedinPosts.length + " posts written");

  // STEP 3 — Generate cold email templates (Haiku)
  console.log("Step 3/3: Writing 10 cold email templates [haiku]...");
  const emailAngles = [
    "Pain point: wasting money on developers who don't deliver",
    "Pain point: competitor launched an app and you're falling behind",
    "Opportunity: AI tools just made app building 10x faster",
    "Social proof: founder built and launched in 2 weeks with no code",
    "Curiosity: the 3 AI tools replacing $50k dev teams",
    "Direct offer: free 7-day blueprint to build your first app",
    "Authority: lessons from coaching 50+ non-technical founders",
    "Urgency: the AI window is closing — early movers win",
    "Contrarian: you don't need to learn to code (and here's why)",
    "ROI angle: $99/mo coaching vs $5k/mo developer"
  ];

  const coldEmails = [];
  const emailBatchSize = 5;
  for (let i = 0; i < emailAngles.length; i += emailBatchSize) {
    const batch = emailAngles.slice(i, i + emailBatchSize);
    const promises = batch.map(async (angle, j) => {
      const idx = i + j;
      const email = await callClaude(
        MODEL_HAIKU,
        "Write a cold email targeting SME owners and non-technical founders. Be concise, personal, and benefit-focused. No fluff. Under 150 words.",
        `Write cold email template #${idx + 1} for ${config.businessName}.
Angle: ${angle}
Target: SME owners and ${audience}
Products: ${tiers}
Lead magnet: ${config.leadMagnet.name} — ${config.leadMagnet.description}

Include: subject line, body, and sign-off. Use [FirstName] as personalization placeholder.`,
        300
      );
      return { templateNumber: idx + 1, angle, email };
    });
    const results = await Promise.all(promises);
    coldEmails.push(...results);
    console.log("  OK: Emails " + (i + 1) + "-" + Math.min(i + emailBatchSize, emailAngles.length) + " written");
  }
  coldEmails.sort((a, b) => a.templateNumber - b.templateNumber);
  console.log("Step 3 done — " + coldEmails.length + " cold email templates written");

  // Save everything
  const output = {
    generatedAt: new Date().toISOString(),
    businessName: config.businessName,
    contentStrategy: strategy,
    linkedinPosts,
    coldEmails
  };
  fs.writeFileSync(path.join("outputs", "marketing-content.json"), JSON.stringify(output, null, 2));

  console.log("\n=== Marketing Agent Complete ===");
  console.log("Files created:");
  console.log("  outputs/marketing-content.json");
  console.log("\nSummary:");
  console.log("  " + strategy.length + " days of content strategy");
  console.log("  " + linkedinPosts.length + " LinkedIn posts");
  console.log("  " + coldEmails.length + " cold email templates");
}

run().catch(console.error);
