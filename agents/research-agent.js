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
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

async function run() {
  console.log("=== Research Agent Starting ===\n");

  // ── Step 1: Product Discovery (Haiku) ──────────────────────────────
  console.log("[01] Generating product candidates [haiku]...");
  const step1Raw = await callClaude(
    MODEL_HAIKU,
    "Output only valid JSON. No markdown fences. No explanation.",
    `You are a South African e-commerce product researcher.
Generate 5 product candidates for a pet health dropshipping store.
Focus areas: senior pets, anxiety/calming products, small/exotic pets.
Return ONLY this JSON:
{"products":[{"name":"...","category":"...","targetPet":"...","problemSolved":"...","estimatedCostUSD":0,"recommendedRetailZAR":0,"monthlySearchVolume":0,"trendDirection":"up|stable|down","competitionLevel":"low|medium|high"}]}`,
    600
  );
  const step1 = parseJSON(step1Raw);
  console.log("[01] Done — " + step1.products.length + " products found\n");

  // ── Step 2: Margin Analysis (Haiku) ────────────────────────────────
  console.log("[02] Running margin analysis [haiku]...");
  const step2Raw = await callClaude(
    MODEL_HAIKU,
    "Output only valid JSON. No markdown fences. No explanation.",
    `Analyse margins for these products. Assume R800/month ad spend and current USD/ZAR ~18.5.
For each product calculate: grossMarginPercent, breakevenUnitsPerMonth, riskScore (1-10), opportunityScore (1-10), shortReasoning.
Products: ${JSON.stringify(step1.products)}
Return ONLY: {"margins":[{"name":"...","grossMarginPercent":0,"breakevenUnitsPerMonth":0,"riskScore":0,"opportunityScore":0,"shortReasoning":"..."}]}`,
    600
  );
  const step2 = parseJSON(step2Raw);
  console.log("[02] Done — margins calculated\n");

  // ── Step 3: Supplier Scoring (Haiku) ───────────────────────────────
  console.log("[03] Scoring suppliers [haiku]...");
  const step3Raw = await callClaude(
    MODEL_HAIKU,
    "Output only valid JSON. No markdown fences. No explanation.",
    `Compare suppliers for each product: CJDropshipping, AliExpress, and a hypothetical local SA supplier.
For each product+supplier combo include: shippingDaysSA, dutyRisk (low|medium|high), supplierNotes.
Products: ${JSON.stringify(step1.products.map(p => p.name))}
Return ONLY: {"suppliers":[{"product":"...","cjDropshipping":{"shippingDaysSA":0,"dutyRisk":"...","supplierNotes":"..."},"aliExpress":{"shippingDaysSA":0,"dutyRisk":"...","supplierNotes":"..."},"localSA":{"shippingDaysSA":0,"dutyRisk":"...","supplierNotes":"..."}}]}`,
    800
  );
  const step3 = parseJSON(step3Raw);
  console.log("[03] Done — supplier matrix built\n");

  // ── Step 4: Competitive Gap Analysis (Sonnet) ─────────────────────
  console.log("[04] Competitive gap analysis [sonnet]...");
  const step4Raw = await callClaude(
    MODEL_SONNET,
    "Output only valid JSON. No markdown fences. No explanation.",
    `You are a South African e-commerce strategist.
Given these products, margins, and suppliers, pick the single best launch product.
Products: ${JSON.stringify(step1.products)}
Margins: ${JSON.stringify(step2.margins)}
Suppliers: ${JSON.stringify(step3.suppliers)}
Return ONLY:
{"winnerProduct":"...","winnerReason":"...","top3CompetitorWeaknesses":["...","...","..."],"pricingAngle":"...","bestTrafficChannel":"...","uniqueUSP":"..."}`,
    600
  );
  const step4 = parseJSON(step4Raw);
  console.log("[04] Done — winner: " + step4.winnerProduct + "\n");

  // ── Step 5: Master BI Document (Sonnet) ────────────────────────────
  console.log("[05] Synthesising master BI document [sonnet]...");
  const step5Raw = await callClaude(
    MODEL_SONNET,
    "Output only valid JSON. No markdown fences. No explanation.",
    `Synthesise all research into a master BI document for a South African pet health dropshipping store.
Products: ${JSON.stringify(step1.products)}
Margins: ${JSON.stringify(step2.margins)}
Suppliers: ${JSON.stringify(step3.suppliers)}
Competitive: ${JSON.stringify(step4)}
Return ONLY this JSON structure:
{"businessName":"...","tagline":"...","niche":"Pet Health","subNiche":"...","launchProduct":{"name":"...","reason":"..."},"productCatalogue":[{"name":"...","category":"...","targetPet":"...","grossMarginPercent":0,"opportunityScore":0,"riskScore":0}],"supplierMatrix":[{"product":"...","bestSupplier":"...","shippingDays":0,"dutyRisk":"..."}],"competitivePositioning":{"uniqueUSP":"...","pricingAngle":"...","top3CompetitorWeaknesses":["...","...","..."]},"trafficStrategy":{"primaryChannel":"...","secondaryChannels":["..."],"contentApproach":"..."},"pricingStrategy":"...","30DayPlan":[{"week":1,"goals":["..."]},{"week":2,"goals":["..."]},{"week":3,"goals":["..."]},{"week":4,"goals":["..."]}],"riskFactors":["..."],"successMetrics":["..."],"estimatedMonth1Revenue":"...","estimatedMonth3Revenue":"..."}`,
    1500
  );
  const step5 = parseJSON(step5Raw);
  step5.generatedAt = new Date().toISOString();
  step5.modelPipeline = { steps1to3: MODEL_HAIKU, steps4to5: MODEL_SONNET };

  fs.writeFileSync(path.join("outputs", "research.json"), JSON.stringify(step5, null, 2));
  console.log("[05] Done — saved to outputs/research.json\n");

  console.log("=== Research Agent Complete ===");
  console.log("Launch product: " + step5.launchProduct.name);
  console.log("Business: " + step5.businessName + " — " + step5.tagline);
}

run().catch(console.error);
