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

function parseJSON(raw) {
  let cleaned = raw.replace(/```json|```/g, "").trim();
  cleaned = cleaned.replace(/\/\/[^\n]*/g, "");
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

async function callClaudeJSON(model, system, user, maxTokens) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = attempt === 1 ? user : user + "\n\nPREVIOUS ATTEMPT HAD INVALID JSON. Return ONLY a single valid JSON object. No comments, no trailing commas, no truncation.";
    const raw = await callClaude(model, system, prompt, maxTokens);
    try {
      return parseJSON(raw);
    } catch (e) {
      console.log(`  ⚠ JSON parse failed (attempt ${attempt}/3): ${e.message}`);
      if (attempt === 3) throw new Error("Failed to get valid JSON after 3 attempts");
    }
  }
}

async function run() {
  console.log("=== Setup Agent Starting ===\n");

  const research = JSON.parse(fs.readFileSync(path.join("outputs", "research.json"), "utf8"));
  console.log("Loaded outputs/research.json\n");

  // ── Step 1: Business Config (Haiku) ───────────────────────────────
  console.log("[01] Generating business config [haiku]...");
  const businessConfig = await callClaudeJSON(
    MODEL_HAIKU,
    "You are a JSON API. Return ONLY a single valid JSON object. No markdown, no comments, no explanation.",
    `Generate a business config JSON for a South African pet health dropshipping store.

Use this research data:
businessName: ${research.businessName}
tagline: ${research.tagline}
niche: ${research.niche}
subNiche: ${research.subNiche}
launchProduct: ${JSON.stringify(research.launchProduct)}
productCatalogue: ${JSON.stringify(research.productCatalogue)}
supplierMatrix: ${JSON.stringify(research.supplierMatrix)}
pricingStrategy: ${research.pricingStrategy}
trafficStrategy: ${JSON.stringify(research.trafficStrategy)}

Return ONLY this JSON:
{"businessName":"${research.businessName}","tagline":"${research.tagline}","niche":"${research.niche}","subNiche":"${research.subNiche}","launchProduct":{"name":"str","reason":"str"},"productCatalogue":[{"name":"str","category":"str","targetPet":"str","grossMarginPercent":0,"opportunityScore":0,"riskScore":0,"priceZAR":0}],"supplierMatrix":[{"product":"str","bestSupplier":"str","shippingDays":0,"dutyRisk":"str"}],"pricingStrategy":"str","trafficStrategy":{"primaryChannel":"str","secondaryChannels":["str"],"contentApproach":"str"},"emailFromName":"PawVital SA","emailFromAddress":"noreply@pawvital.co.za"}`,
    1200
  );
  fs.mkdirSync("config", { recursive: true });
  fs.writeFileSync(path.join("config", "business-config.json"), JSON.stringify(businessConfig, null, 2));
  console.log("[01] Done — config/business-config.json saved\n");

  // ── Step 2: Landing Page (Sonnet) ─────────────────────────────────
  console.log("[02] Building landing page [sonnet]...");
  const landingPage = await callClaude(
    MODEL_SONNET,
    "You are an expert conversion copywriter and frontend developer. Write clean, modern HTML with embedded CSS. No frameworks. Return ONLY the HTML — no markdown fences, no explanation.",
    `Build a complete single-file HTML landing page for ${research.launchProduct.name}.

Business: ${research.businessName}
Tagline: ${research.tagline}
Product: ${research.launchProduct.name}
Price: ${research.pricingStrategy}
USP: ${research.competitivePositioning.uniqueUSP}
Pricing angle: ${research.competitivePositioning.pricingAngle}
Target: South African pet owners with senior cats suffering kidney issues

Requirements:
- Mobile-first responsive design
- Green (#2d6a4f, #40916c, #52b788) and white color scheme
- Hero section: headline about senior cat kidney health, subheadline, hero image placeholder, CTA button
- Problem/solution section: why senior cats need kidney support, how this product helps
- Product benefits: 4-5 key benefits with icons (use emoji as icons)
- Pricing section: show price in ZAR (${research.pricingStrategy}), subscribe-and-save option
- Trust signals: "Shipped from SA", "Vet-informed formula", "30-day guarantee"
- Buy button placeholder (links to #buy)
- Footer with copyright PawVital SA 2026
- Clean professional design that converts
- Include meta tags for SEO
- Include Open Graph tags`,
    16000
  );
  fs.writeFileSync(path.join("outputs", "landing-page.html"), landingPage);
  console.log("[02] Done — outputs/landing-page.html saved\n");

  // ── Step 3: Shopify Listings (Haiku) ──────────────────────────────
  console.log("[03] Generating Shopify product listings [haiku]...");
  const top3 = research.productCatalogue.slice(0, 3);
  const shopifyListings = await callClaudeJSON(
    MODEL_HAIKU,
    "You are a JSON API. Return ONLY a single valid JSON object. No markdown, no comments, no explanation.",
    `Generate Shopify product listings for these 3 pet health products for a South African store called ${research.businessName}.

Products: ${JSON.stringify(top3)}
Supplier info: ${JSON.stringify(research.supplierMatrix.slice(0, 3))}
Pricing context: ${research.pricingStrategy}

For each product include: title, description (compelling 2-3 sentence product description for SA pet owners), priceZAR (number), compareAtPriceZAR (number, slightly higher for perceived value), tags (array of relevant tags), vendor ("${research.businessName}"), product_type, seo (object with title under 60 chars and description under 155 chars).

Return ONLY: {"listings":[{"title":"str","description":"str","priceZAR":0,"compareAtPriceZAR":0,"tags":["str"],"vendor":"${research.businessName}","product_type":"str","seo":{"title":"str","description":"str"}}]}`,
    1500
  );
  fs.writeFileSync(path.join("outputs", "shopify-listings.json"), JSON.stringify(shopifyListings, null, 2));
  console.log("[03] Done — outputs/shopify-listings.json saved\n");

  // ── Step 4: Supplier Setup Checklist (Haiku) ──────────────────────
  console.log("[04] Generating supplier setup checklist [haiku]...");
  const supplierChecklist = await callClaude(
    MODEL_HAIKU,
    "Write a clear, actionable step-by-step guide in Markdown format. Be specific with URLs and practical details. No JSON — return Markdown only.",
    `Write a supplier setup checklist for ${research.businessName}, a South African pet health dropshipping store.

Winning product: ${research.launchProduct.name}
Best supplier: ${research.supplierMatrix[0].bestSupplier}
Shipping estimate: ${research.supplierMatrix[0].shippingDays} days to SA
Duty risk: ${research.supplierMatrix[0].dutyRisk}

Write step-by-step instructions covering:
1. Registering on CJDropshipping (https://cjdropshipping.com) — account setup, verification, payment method
2. Finding the winning product (${research.launchProduct.name}) — search tips, what to look for, quality checks
3. Requesting product samples — why, how, expected cost and timeline to SA
4. Connecting CJDropshipping to a Shopify store — app installation, syncing products, setting shipping rules for South Africa
5. Setting up shipping templates for SA delivery — estimated times, tracking, customer communication
6. Customs and duty considerations for importing pet health supplements to South Africa
7. Backup plan — when to switch to a local SA supplier

Include practical tips and warnings for SA-based sellers.`,
    2000
  );
  fs.writeFileSync(path.join("outputs", "supplier-setup.md"), supplierChecklist);
  console.log("[04] Done — outputs/supplier-setup.md saved\n");

  // Summary
  const filesCreated = [
    "config/business-config.json",
    "outputs/landing-page.html",
    "outputs/shopify-listings.json",
    "outputs/supplier-setup.md",
  ];
  console.log("=== Setup Agent Complete ===");
  console.log("Files created:");
  filesCreated.forEach(f => console.log("  ✓ " + f));
}

run().catch(console.error);
