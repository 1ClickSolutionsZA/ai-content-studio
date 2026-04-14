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
  console.log("=== Research Agent Starting ===\n");

  // ── Step 1: Product Discovery (Haiku) ──────────────────────────────
  console.log("[01] Generating product candidates [haiku]...");
  const step1 = await callClaudeJSON(
    MODEL_HAIKU,
    "You are a JSON API. Return ONLY a single valid JSON object. No markdown, no comments, no explanation.",
    `You are a South African e-commerce product researcher.
Generate 5 product candidates for a pet health dropshipping store.
Focus areas: senior pets, anxiety/calming products, small/exotic pets.
Return ONLY this JSON:
{"products":[{"name":"...","category":"...","targetPet":"...","problemSolved":"...","estimatedCostUSD":0,"recommendedRetailZAR":0,"monthlySearchVolume":0,"trendDirection":"up|stable|down","competitionLevel":"low|medium|high"}]}`,
    900
  );
  console.log("[01] Done — " + step1.products.length + " products found\n");

  // ── Step 2: Margin Analysis (Haiku) ────────────────────────────────
  console.log("[02] Running margin analysis [haiku]...");
  const step2 = await callClaudeJSON(
    MODEL_HAIKU,
    "You are a JSON API. Return ONLY a single valid JSON object. No markdown, no comments, no explanation.",
    `Analyse margins for these products. Assume R800/month ad spend and current USD/ZAR ~18.5.
For each product calculate: grossMarginPercent, breakevenUnitsPerMonth, riskScore (1-10), opportunityScore (1-10), shortReasoning.
Products: ${JSON.stringify(step1.products)}
Return ONLY: {"margins":[{"name":"...","grossMarginPercent":0,"breakevenUnitsPerMonth":0,"riskScore":0,"opportunityScore":0,"shortReasoning":"..."}]}`,
    800
  );
  console.log("[02] Done — margins calculated\n");

  // ── Step 3: Supplier Scoring (Haiku) ───────────────────────────────
  console.log("[03] Scoring suppliers [haiku]...");
  const step3 = await callClaudeJSON(
    MODEL_HAIKU,
    "You are a JSON API. Return ONLY a single valid JSON object. No markdown, no comments, no explanation.",
    `Compare suppliers for each product: CJDropshipping, AliExpress, and a hypothetical local SA supplier.
For each product+supplier combo include: shippingDaysSA, dutyRisk (low|medium|high), supplierNotes.
Products: ${JSON.stringify(step1.products.map(p => p.name))}
Return ONLY: {"suppliers":[{"product":"...","cjDropshipping":{"shippingDaysSA":0,"dutyRisk":"...","supplierNotes":"..."},"aliExpress":{"shippingDaysSA":0,"dutyRisk":"...","supplierNotes":"..."},"localSA":{"shippingDaysSA":0,"dutyRisk":"...","supplierNotes":"..."}}]}`,
    1200
  );
  console.log("[03] Done — supplier matrix built\n");

  // ── Step 4: Competitive Gap Analysis (Sonnet) ─────────────────────
  console.log("[04] Competitive gap analysis [sonnet]...");
  const step4 = await callClaudeJSON(
    MODEL_SONNET,
    "You are a JSON API. Return ONLY a single valid JSON object. No markdown, no comments, no explanation.",
    `You are a South African e-commerce strategist.
Given these products, margins, and suppliers, pick the single best launch product.
Products: ${JSON.stringify(step1.products)}
Margins: ${JSON.stringify(step2.margins)}
Suppliers: ${JSON.stringify(step3.suppliers)}
Return ONLY:
{"winnerProduct":"...","winnerReason":"...","top3CompetitorWeaknesses":["...","...","..."],"pricingAngle":"...","bestTrafficChannel":"...","uniqueUSP":"..."}`,
    600
  );
  console.log("[04] Done — winner: " + step4.winnerProduct + "\n");

  // ── Step 5: Master BI Document (Sonnet) ────────────────────────────
  console.log("[05] Synthesising master BI document [sonnet]...");
  const step5 = await callClaudeJSON(
    MODEL_SONNET,
    "You are a JSON API. Return ONLY a single valid JSON object. No markdown, no comments, no explanation.",
    `Synthesise all research into a master BI document for a South African pet health dropshipping store.
Products: ${JSON.stringify(step1.products)}
Margins: ${JSON.stringify(step2.margins)}
Suppliers: ${JSON.stringify(step3.suppliers)}
Competitive: ${JSON.stringify(step4)}

IMPORTANT: Keep all string values SHORT (under 80 chars). Keep arrays to max 3-4 items. Return ONLY this JSON structure:
{"businessName":"str","tagline":"str","niche":"Pet Health","subNiche":"str","launchProduct":{"name":"str","reason":"str"},"productCatalogue":[{"name":"str","category":"str","targetPet":"str","grossMarginPercent":0,"opportunityScore":0,"riskScore":0}],"supplierMatrix":[{"product":"str","bestSupplier":"str","shippingDays":0,"dutyRisk":"str"}],"competitivePositioning":{"uniqueUSP":"str","pricingAngle":"str","top3CompetitorWeaknesses":["str","str","str"]},"trafficStrategy":{"primaryChannel":"str","secondaryChannels":["str"],"contentApproach":"str"},"pricingStrategy":"str","30DayPlan":[{"week":1,"goals":["str"]},{"week":2,"goals":["str"]},{"week":3,"goals":["str"]},{"week":4,"goals":["str"]}],"riskFactors":["str","str","str"],"successMetrics":["str","str","str"],"estimatedMonth1Revenue":"str","estimatedMonth3Revenue":"str"}`,
    2000
  );
  step5.generatedAt = new Date().toISOString();
  step5.modelPipeline = { steps1to3: MODEL_HAIKU, steps4to5: MODEL_SONNET };

  fs.writeFileSync(path.join("outputs", "research.json"), JSON.stringify(step5, null, 2));
  console.log("[05] Done — saved to outputs/research.json\n");

  console.log("=== Research Agent Complete ===");
  console.log("Launch product: " + step5.launchProduct.name);
  console.log("Business: " + step5.businessName + " — " + step5.tagline);
}

run().catch(console.error);
