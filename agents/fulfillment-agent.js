import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const MODEL_SONNET = "claude-sonnet-4-6";
const LOG_PATH = path.join("outputs", "fulfillment-log.json");

async function callClaude(model, system, user, maxTokens) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens || 800,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  return response.content[0].text;
}

function loadLog() {
  if (fs.existsSync(LOG_PATH)) {
    return JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  }
  return { deliveries: [] };
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

async function fulfillOrder(clientName, clientEmail, tierName) {
  console.log("=== Fulfillment Agent Starting ===");
  console.log(`Order: ${clientName} <${clientEmail}> — ${tierName} tier`);

  // Load business config
  const config = JSON.parse(fs.readFileSync(path.join("config", "business-config.json"), "utf8"));
  const tier = config.productTiers.find(t => t.name.toLowerCase() === tierName.toLowerCase());
  if (!tier) {
    console.error("Unknown tier: " + tierName + ". Available: " + config.productTiers.map(t => t.name).join(", "));
    process.exit(1);
  }
  console.log("Tier matched: " + tier.name + " ($" + tier.priceUSD + "/mo)");

  // STEP 1 — Generate welcome package content (Sonnet)
  console.log("Step 1/3: Generating welcome package [sonnet]...");
  const welcomeContent = await callClaude(
    MODEL_SONNET,
    "You are a warm, professional onboarding specialist for a tech education brand. Write in a friendly, direct tone.",
    `Generate a welcome package for a new ${tier.name} tier client.

Client name: ${clientName}
Business: ${config.businessName} — ${config.tagline}
Tier: ${tier.name} ($${tier.priceUSD}/mo)
What's included: ${tier.description}
Lead magnet: ${config.leadMagnet.name} — ${config.leadMagnet.description}

Write the following sections:
1. Personal welcome message (3-4 sentences, address them by first name)
2. What's included in their tier (formatted as a bullet list)
3. Getting started checklist (5 numbered steps for their first week)
4. What to expect next (timeline of their first 30 days)
5. Support info (how to reach out, expected response times)

Keep the total under 400 words. Be specific to their tier level.`,
    1200
  );
  console.log("Step 1 done — welcome package generated");

  // STEP 2 — Generate welcome email HTML (Haiku)
  console.log("Step 2/3: Building welcome email [haiku]...");
  const emailHtml = await callClaude(
    MODEL_HAIKU,
    "Convert the following welcome package into a clean, simple HTML email. Use inline CSS only. Dark background (#111), green accents (#22c55e), white text. No images. Keep it professional and mobile-friendly. Output ONLY the HTML — no explanation.",
    `Create an HTML email for this welcome package:

To: ${clientName}
From: ${config.emailFromName}
Tier: ${tier.name}

Content:
${welcomeContent}`,
    1500
  );
  console.log("Step 2 done — email HTML built");

  // STEP 3 — Send email via Resend (or dry-run)
  console.log("Step 3/3: Sending welcome email...");
  const subject = `Welcome to ${config.businessName}, ${clientName.split(" ")[0]}! Your ${tier.name} journey starts now`;
  let emailResult;

  if (resend) {
    try {
      const sent = await resend.emails.send({
        from: `${config.emailFromName} <${config.emailFromAddress}>`,
        to: [clientEmail],
        subject,
        html: emailHtml,
      });
      emailResult = { status: "sent", id: sent.data?.id || "unknown", provider: "resend" };
      console.log("  Email sent via Resend — ID: " + emailResult.id);
    } catch (err) {
      emailResult = { status: "failed", error: err.message, provider: "resend" };
      console.error("  Resend error: " + err.message);
    }
  } else {
    emailResult = { status: "dry-run", reason: "RESEND_API_KEY not set", provider: "none" };
    console.log("  Dry-run mode — RESEND_API_KEY not configured. Email content saved to log.");
  }

  // Log the delivery
  const log = loadLog();
  const entry = {
    timestamp: new Date().toISOString(),
    client: { name: clientName, email: clientEmail },
    tier: { name: tier.name, priceUSD: tier.priceUSD },
    email: { subject, result: emailResult },
    welcomeContent,
    emailHtml,
  };
  log.deliveries.push(entry);
  saveLog(log);

  console.log("\n=== Fulfillment Agent Complete ===");
  console.log("Delivery logged to: " + LOG_PATH);
  console.log("Email status: " + emailResult.status);
  return entry;
}

// CLI entry point: node agents/fulfillment-agent.js "Client Name" "email@example.com" "Builder"
const [clientName, clientEmail, tierName] = process.argv.slice(2);
if (!clientName || !clientEmail || !tierName) {
  console.log("Usage: node agents/fulfillment-agent.js <clientName> <clientEmail> <tierName>");
  console.log('Example: node agents/fulfillment-agent.js "Jane Smith" "jane@example.com" "Builder"');
  process.exit(1);
}

fulfillOrder(clientName, clientEmail, tierName).catch(console.error);
