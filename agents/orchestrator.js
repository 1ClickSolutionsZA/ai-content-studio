import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL_HAIKU = "claude-haiku-4-5-20251001";

async function callClaude(system, user, maxTokens) {
  const response = await client.messages.create({
    model: MODEL_HAIKU,
    max_tokens: maxTokens || 600,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  return response.content[0].text;
}

function loadJSON(filePath) {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  return null;
}

function daysSince(isoDate) {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
}

async function run() {
  console.log("=== Orchestrator Starting ===");
  console.log("Timestamp: " + new Date().toISOString());
  console.log("");

  // ─── Load all data ───────────────────────────────────────
  const config = loadJSON(path.join("config", "business-config.json"));
  const research = loadJSON(path.join("outputs", "research.json"));
  const setupReport = loadJSON(path.join("outputs", "setup-report.json"));
  const marketing = loadJSON(path.join("outputs", "marketing-content.json"));
  const fulfillmentLog = loadJSON(path.join("outputs", "fulfillment-log.json"));
  const commsLog = loadJSON(path.join("outputs", "comms-log.json"));

  const alerts = [];
  const metrics = {};

  // ─── Agent health checks ────────────────────────────────
  console.log("--- AGENT HEALTH CHECK ---");

  const agents = [
    { name: "Research", file: "outputs/research.json", data: research },
    { name: "Setup", file: "outputs/setup-report.json", data: setupReport },
    { name: "Marketing", file: "outputs/marketing-content.json", data: marketing },
    { name: "Fulfillment", file: "outputs/fulfillment-log.json", data: fulfillmentLog },
    { name: "Comms", file: "outputs/comms-log.json", data: commsLog },
  ];

  const agentStatus = {};
  for (const agent of agents) {
    if (agent.data) {
      const stat = fs.statSync(agent.file);
      const age = daysSince(stat.mtime.toISOString());
      agentStatus[agent.name] = { status: "OK", lastUpdated: stat.mtime.toISOString(), ageDays: age };
      if (age > 7) {
        alerts.push({ level: "warning", agent: agent.name, message: `Output is ${age} days old — consider re-running` });
      }
      console.log(`  [OK] ${agent.name} — last updated ${age === 0 ? "today" : age + "d ago"}`);
    } else {
      agentStatus[agent.name] = { status: "MISSING", lastUpdated: null };
      alerts.push({ level: "error", agent: agent.name, message: "Output file missing — agent needs to run" });
      console.log(`  [MISSING] ${agent.name} — ${agent.file} not found`);
    }
  }
  console.log("");

  // ─── Business metrics ───────────────────────────────────
  console.log("--- BUSINESS METRICS ---");

  // Students (unique from fulfillment + comms)
  const studentEmails = new Set();
  if (fulfillmentLog?.deliveries) {
    fulfillmentLog.deliveries.forEach(d => studentEmails.add(d.client.email));
  }
  if (commsLog?.communications) {
    commsLog.communications.forEach(c => { if (c.student?.email) studentEmails.add(c.student.email); });
  }
  metrics.totalStudents = studentEmails.size;
  console.log(`  Students: ${metrics.totalStudents}`);

  // Revenue estimate (from fulfillment tiers)
  let monthlyRevenue = 0;
  const tierCounts = {};
  if (fulfillmentLog?.deliveries) {
    for (const d of fulfillmentLog.deliveries) {
      const tierName = d.tier.name;
      tierCounts[tierName] = (tierCounts[tierName] || 0) + 1;
      monthlyRevenue += d.tier.priceUSD;
    }
  }
  metrics.estimatedMonthlyRevenue = monthlyRevenue;
  metrics.tierBreakdown = tierCounts;
  console.log(`  Est. monthly revenue: $${monthlyRevenue}`);
  if (Object.keys(tierCounts).length > 0) {
    console.log(`  Tier breakdown: ${Object.entries(tierCounts).map(([k, v]) => k + "=" + v).join(", ")}`);
  }

  // Emails sent
  let emailsSent = 0;
  let emailsFailed = 0;
  let emailsDryRun = 0;
  const countEmail = (result) => {
    if (result?.status === "sent") emailsSent++;
    else if (result?.status === "failed") emailsFailed++;
    else emailsDryRun++;
  };
  if (fulfillmentLog?.deliveries) {
    fulfillmentLog.deliveries.forEach(d => countEmail(d.email?.result));
  }
  if (commsLog?.communications) {
    commsLog.communications.forEach(c => countEmail(c.email?.result));
  }
  metrics.emailsSent = emailsSent;
  metrics.emailsFailed = emailsFailed;
  metrics.emailsDryRun = emailsDryRun;
  console.log(`  Emails — sent: ${emailsSent}, failed: ${emailsFailed}, dry-run: ${emailsDryRun}`);

  if (emailsFailed > 0) {
    alerts.push({ level: "error", agent: "Fulfillment/Comms", message: `${emailsFailed} email(s) failed delivery — check logs` });
  }

  // Content posts scheduled
  const totalPosts = marketing?.linkedinPosts?.length || 0;
  const totalColdEmails = marketing?.coldEmails?.length || 0;
  metrics.linkedinPostsScheduled = totalPosts;
  metrics.coldEmailTemplates = totalColdEmails;
  console.log(`  LinkedIn posts scheduled: ${totalPosts}/30`);
  console.log(`  Cold email templates: ${totalColdEmails}`);
  console.log("");

  // ─── Autonomous decisions ───────────────────────────────
  console.log("--- DECISIONS & ALERTS ---");

  // Check for overdue onboarding comms
  if (fulfillmentLog?.deliveries && commsLog) {
    for (const delivery of fulfillmentLog.deliveries) {
      const daysSinceOrder = daysSince(delivery.timestamp);
      const studentComms = commsLog.communications.filter(
        c => c.student?.email === delivery.client.email && c.type === "onboarding"
      );
      const maxEmailSent = studentComms.length > 0
        ? Math.max(...studentComms.map(c => c.emailNumber))
        : 0;

      // Check schedule: if day >= threshold but email not sent
      const schedule = [
        { emailNum: 1, day: 1 },
        { emailNum: 2, day: 3 },
        { emailNum: 3, day: 5 },
        { emailNum: 4, day: 7 },
        { emailNum: 5, day: 14 },
      ];
      const overdue = schedule.filter(s => daysSinceOrder >= s.day && s.emailNum > maxEmailSent);
      if (overdue.length > 0) {
        const msg = `${delivery.client.name} has ${overdue.length} overdue onboarding email(s) — run: node agents/comms-agent.js onboard "${delivery.client.name}" "${delivery.client.email}" ${daysSinceOrder}`;
        alerts.push({ level: "action", agent: "Comms", message: msg });
      }
    }
  }

  // Suggest next LinkedIn post
  if (marketing?.contentStrategy) {
    const today = new Date();
    const marketingDate = new Date(marketing.generatedAt);
    const daysSinceGenerated = daysSince(marketing.generatedAt);
    const nextPostDay = Math.min(daysSinceGenerated + 1, 30);
    const nextPost = marketing.contentStrategy.find(s => s.day === nextPostDay);
    if (nextPost) {
      alerts.push({
        level: "suggestion",
        agent: "Marketing",
        message: `Post day ${nextPost.day} today — theme: ${nextPost.theme}, hook: "${nextPost.hook.slice(0, 60)}..."`,
      });
    }
    if (daysSinceGenerated >= 28) {
      alerts.push({ level: "warning", agent: "Marketing", message: "30-day content calendar nearly exhausted — re-run marketing agent" });
    }
  }

  // Check fulfillment errors
  if (fulfillmentLog?.deliveries) {
    const failed = fulfillmentLog.deliveries.filter(d => d.email?.result?.status === "failed");
    if (failed.length > 0) {
      failed.forEach(f => {
        alerts.push({
          level: "error",
          agent: "Fulfillment",
          message: `Failed delivery for ${f.client.name} <${f.client.email}> — ${f.email.result.error}`,
        });
      });
    }
  }

  // Dry-run warning
  if (emailsDryRun > 0 && emailsSent === 0) {
    alerts.push({ level: "warning", agent: "System", message: "All emails in dry-run mode — set RESEND_API_KEY in .env to enable delivery" });
  }

  if (alerts.length === 0) {
    console.log("  No alerts — all systems nominal.");
  } else {
    for (const alert of alerts) {
      const icon = alert.level === "error" ? "[ERROR]" : alert.level === "warning" ? "[WARN]" : alert.level === "action" ? "[ACTION]" : "[TIP]";
      console.log(`  ${icon} ${alert.agent}: ${alert.message}`);
    }
  }
  console.log("");

  // ─── Weekly report (Haiku) ──────────────────────────────
  console.log("--- GENERATING WEEKLY REPORT ---");
  const reportSummary = await callClaude(
    "You are a concise business operations analyst. Write a brief weekly report. Use plain text with clear sections. Under 300 words.",
    `Write a weekly business report for ${config.businessName}.

Metrics:
- Total students: ${metrics.totalStudents}
- Estimated monthly revenue: $${metrics.estimatedMonthlyRevenue}
- Tier breakdown: ${JSON.stringify(metrics.tierBreakdown)}
- Emails sent: ${metrics.emailsSent}, failed: ${metrics.emailsFailed}, dry-run: ${metrics.emailsDryRun}
- LinkedIn posts scheduled: ${metrics.linkedinPostsScheduled}/30
- Cold email templates ready: ${metrics.coldEmailTemplates}

Agent status:
${Object.entries(agentStatus).map(([name, s]) => `- ${name}: ${s.status}${s.ageDays !== undefined ? " (" + s.ageDays + "d old)" : ""}`).join("\n")}

Alerts:
${alerts.length > 0 ? alerts.map(a => `- [${a.level.toUpperCase()}] ${a.agent}: ${a.message}`).join("\n") : "None"}

Write: executive summary (2-3 sentences), key metrics table, top 3 priorities for next week, and any risks.`,
    600
  );

  const weeklyReport = {
    generatedAt: new Date().toISOString(),
    businessName: config.businessName,
    metrics,
    agentStatus,
    alerts,
    summary: reportSummary,
  };
  fs.writeFileSync(path.join("outputs", "weekly-report.json"), JSON.stringify(weeklyReport, null, 2));
  console.log("Weekly report saved to outputs/weekly-report.json");
  console.log("");

  // ─── Console summary ───────────────────────────────────
  console.log("=== WEEKLY REPORT ===");
  console.log(reportSummary);
  console.log("");
  console.log("=== Orchestrator Complete ===");
}

run().catch(console.error);
