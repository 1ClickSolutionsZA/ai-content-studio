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
  console.log("=== Setup Agent Starting ===");

  // Load Research Agent output
  const research = JSON.parse(fs.readFileSync(path.join("outputs", "research.json"), "utf8"));
  console.log("Research doc loaded");

  // STEP 1 — Generate business config (Haiku)
  console.log("Step 1/5: Generating business config [haiku]...");
  const configRaw = await callClaude(
    MODEL_HAIKU,
    "Output only valid JSON. No markdown. No explanation.",
    "Based on this research, generate a business config JSON. Include: businessName, tagline, targetAudience, productTiers (array with name, priceUSD, priceZAR, description), leadMagnet (name, description), primaryChannel, emailFromName, emailFromAddress (use noreply@buildwithoutcode.com). Research: " + research.pricing + " " + research.summary,
    600
  );
  let businessConfig;
  try {
    businessConfig = JSON.parse(configRaw.replace(/```json|```/g, "").trim());
  } catch (e) {
    businessConfig = {
      businessName: "BuildWithoutCode",
      tagline: "Build real products with AI. No coding required.",
      targetAudience: "Non-technical solopreneurs and founders",
      emailFromName: "BuildWithoutCode",
      emailFromAddress: "noreply@buildwithoutcode.com",
      primaryChannel: "LinkedIn",
      leadMagnet: {
        name: "7-Day AI App Blueprint",
        description: "Day-by-day walkthrough of building your first app with AI tools"
      },
      productTiers: [
        { name: "Builder", priceUSD: 99, priceZAR: 1800, description: "Weekly async coaching, Discord community, monthly Q&A, prompt templates" },
        { name: "Founder", priceUSD: 249, priceZAR: 4500, description: "Bi-weekly 1:1 calls, priority support, custom prompts, mastermind" },
        { name: "Accelerator", priceUSD: 499, priceZAR: 9000, description: "Weekly 1:1 calls, live coding sessions, white-glove support, direct Slack access" }
      ]
    };
  }
  fs.writeFileSync(path.join("config", "business-config.json"), JSON.stringify(businessConfig, null, 2));
  console.log("Step 1 done — config saved");

  // STEP 2 — Generate landing page (Sonnet)
  console.log("Step 2/5: Building landing page [sonnet]...");
  const landingPage = await callClaude(
    MODEL_SONNET,
    "You are an expert conversion copywriter and frontend developer. Write clean, modern HTML with embedded CSS and JS. No frameworks needed.",
    `Write a complete single-file HTML landing page for this business. 
Business: ${businessConfig.businessName}
Tagline: ${businessConfig.tagline}
Target: ${businessConfig.targetAudience}
Lead magnet: ${businessConfig.leadMagnet.name} — ${businessConfig.leadMagnet.description}
Products: ${businessConfig.productTiers.map(t => t.name + " $" + t.priceUSD + "/mo — " + t.description).join(" | ")}

Requirements:
- Modern dark theme with green accents
- Hero section with headline, subheadline, and email capture form
- Problem/solution section
- 3 pricing tier cards
- Simple FAQ section
- Footer with copyright
- Mobile responsive
- Email form should show a success message on submit (no backend needed for now)
- Clean professional design that converts
- Include meta tags for SEO`,
    16000
  );
  fs.writeFileSync(path.join("outputs", "landing-page.html"), landingPage);
  console.log("Step 2 done — landing page saved");

  // STEP 3 — Generate Gumroad product descriptions (Haiku)
  console.log("Step 3/5: Generating Gumroad listings [haiku]...");
  const gumroadListings = [];
  for (const tier of businessConfig.productTiers) {
    const listing = await callClaude(
      MODEL_HAIKU,
      "Write compelling Gumroad product listing copy. Be specific and benefit-focused.",
      "Write a Gumroad product listing for: " + tier.name + " tier at $" + tier.priceUSD + "/mo. Description: " + tier.description + ". Target: " + businessConfig.targetAudience + ". Include: product title, short description (2 sentences), full description (bullet points of benefits), and a call to action.",
      400
    );
    gumroadListings.push({ tier: tier.name, priceUSD: tier.priceUSD, priceZAR: tier.priceZAR, listing });
    console.log("  OK: " + tier.name + " listing generated");
  }
  fs.writeFileSync(path.join("outputs", "gumroad-listings.json"), JSON.stringify(gumroadListings, null, 2));
  console.log("Step 3 done — Gumroad listings saved");

  // STEP 4 — Generate email welcome sequence (Haiku)
  console.log("Step 4/5: Writing email sequences [haiku]...");
  const emailSequence = [];
  const emailTopics = [
    "Welcome + deliver lead magnet",
    "The biggest mistake non-technical founders make",
    "Which AI tool should you start with",
    "Your first project walkthrough",
    "Soft pitch for Builder tier"
  ];
  for (let i = 0; i < emailTopics.length; i++) {
    const email = await callClaude(
      MODEL_HAIKU,
      "Write concise, high-converting email marketing copy. Friendly, direct, no fluff.",
      "Write email " + (i + 1) + " of 5 in a welcome sequence for " + businessConfig.businessName + ". Topic: " + emailTopics[i] + ". From: " + businessConfig.emailFromName + ". Target: " + businessConfig.targetAudience + ". Keep under 200 words. Include subject line.",
      300
    );
    emailSequence.push({ emailNumber: i + 1, topic: emailTopics[i], content: email });
    console.log("  OK: Email " + (i + 1) + " written");
  }
  fs.writeFileSync(path.join("outputs", "email-sequence.json"), JSON.stringify(emailSequence, null, 2));
  console.log("Step 4 done — email sequence saved");

  // STEP 5 — Generate setup report (Haiku)
  console.log("Step 5/5: Writing setup report [haiku]...");
  const setupReport = await callClaude(
    MODEL_HAIKU,
    "Write a clear, actionable setup checklist. Be specific.",
    "Write a business setup report for " + businessConfig.businessName + ". List the manual steps the owner needs to complete to go live: 1) Netlify deploy steps for landing-page.html, 2) Gumroad account setup and listing creation, 3) Resend email domain setup, 4) Stripe account setup for payments. Be specific with URLs and steps.",
    1000
  );
  const setupOutput = {
    generatedAt: new Date().toISOString(),
    businessConfig,
    filesCreated: [
      "config/business-config.json",
      "outputs/landing-page.html",
      "outputs/gumroad-listings.json",
      "outputs/email-sequence.json"
    ],
    manualStepsRequired: setupReport
  };
  fs.writeFileSync(path.join("outputs", "setup-report.json"), JSON.stringify(setupOutput, null, 2));

  console.log("=== Setup Agent Complete ===");
  console.log("\nFiles created:");
  setupOutput.filesCreated.forEach(f => console.log("  " + f));
  console.log("\n--- MANUAL STEPS REQUIRED ---");
  console.log(setupReport);
}

run().catch(console.error);
