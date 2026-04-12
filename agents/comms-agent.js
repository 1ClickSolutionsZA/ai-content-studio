import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const LOG_PATH = path.join("outputs", "comms-log.json");

async function callClaude(system, user, maxTokens) {
  const response = await client.messages.create({
    model: MODEL_HAIKU,
    max_tokens: maxTokens || 400,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  return response.content[0].text;
}

function loadLog() {
  if (fs.existsSync(LOG_PATH)) return JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  return { communications: [] };
}

function saveLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join("config", "business-config.json"), "utf8"));
}

function loadEmailSequence() {
  return JSON.parse(fs.readFileSync(path.join("outputs", "email-sequence.json"), "utf8"));
}

async function sendEmail(to, subject, html, config) {
  if (resend) {
    try {
      const sent = await resend.emails.send({
        from: `${config.emailFromName} <${config.emailFromAddress}>`,
        to: [to],
        subject,
        html,
      });
      return { status: "sent", id: sent.data?.id || "unknown", provider: "resend" };
    } catch (err) {
      return { status: "failed", error: err.message, provider: "resend" };
    }
  }
  return { status: "dry-run", reason: "RESEND_API_KEY not set", provider: "none" };
}

function logComm(log, entry) {
  log.communications.push(entry);
  saveLog(log);
}

// ─── COMMAND: onboard ─────────────────────���──────────────────
// Sends the appropriate onboarding email based on how many days since signup
async function cmdOnboard(studentName, studentEmail, daysSinceSignup) {
  console.log("=== Comms Agent: Onboarding ===");
  console.log(`Student: ${studentName} <${studentEmail}> ��� day ${daysSinceSignup}`);

  const config = loadConfig();
  const sequence = loadEmailSequence();
  const log = loadLog();

  // Schedule: email 1 on day 1, email 2 on day 3, email 3 on day 5, email 4 on day 7, email 5 on day 14
  const schedule = [
    { emailNum: 1, day: 1 },
    { emailNum: 2, day: 3 },
    { emailNum: 3, day: 5 },
    { emailNum: 4, day: 7 },
    { emailNum: 5, day: 14 },
  ];

  // Find which emails are due
  const due = schedule.filter(s => s.day <= daysSinceSignup);

  // Check which have already been sent
  const alreadySent = log.communications.filter(
    c => c.student?.email === studentEmail && c.type === "onboarding"
  ).map(c => c.emailNumber);

  const toSend = due.filter(s => !alreadySent.includes(s.emailNum));

  if (toSend.length === 0) {
    console.log("No new onboarding emails due for this student.");
    return;
  }

  for (const item of toSend) {
    const emailData = sequence.find(e => e.emailNumber === item.emailNum);
    if (!emailData) continue;

    console.log(`Sending email ${item.emailNum}/5: "${emailData.topic}"...`);

    // Personalize the email content with Haiku
    const personalizedHtml = await callClaude(
      "Convert this email into clean HTML with inline CSS. Dark background (#111), green accents (#22c55e), white text. Replace any placeholder brackets with sensible defaults. Personalize for the recipient. Output ONLY HTML.",
      `Personalize and convert to HTML email:
To: ${studentName}
From: ${config.emailFromName}
Business: ${config.businessName}
Lead magnet: ${config.leadMagnet.name}

Email content:
${emailData.content}`,
      800
    );

    // Extract subject line from content
    const subjectMatch = emailData.content.match(/Subject Line[:\s]*\n?[#*]*\s*(.+)/i);
    const subject = subjectMatch
      ? subjectMatch[1].replace(/[*#]/g, "").trim()
      : `${config.businessName} — Email ${item.emailNum}`;

    const result = await sendEmail(studentEmail, subject, personalizedHtml, config);
    console.log(`  Email ${item.emailNum} — ${result.status}`);

    logComm(log, {
      timestamp: new Date().toISOString(),
      type: "onboarding",
      emailNumber: item.emailNum,
      student: { name: studentName, email: studentEmail },
      subject,
      daysSinceSignup,
      email: { result },
    });
  }

  console.log("Onboarding run complete — " + toSend.length + " email(s) processed.");
}

// ─── COMMAND: re-engage ��─────────────────────────────────────
// Sends a re-engagement email to an inactive student
async function cmdReEngage(studentName, studentEmail, daysSinceLastActive) {
  console.log("=== Comms Agent: Re-Engagement ===");
  console.log(`Student: ${studentName} <${studentEmail}> — ${daysSinceLastActive} days inactive`);

  const config = loadConfig();
  const log = loadLog();

  const emailContent = await callClaude(
    "Write a short, warm re-engagement email. Be personal, not salesy. Under 120 words.",
    `Write a re-engagement email for ${config.businessName}.
Student: ${studentName} (use first name only)
Days inactive: ${daysSinceLastActive}
Business: ${config.businessName} ��� ${config.tagline}
Target: ${config.targetAudience.primary || config.targetAudience}

The email should:
- Acknowledge they've been away without guilt-tripping
- Remind them of one specific benefit they're missing
- Offer a quick win to get them back (e.g. a 15-min challenge)
- Include a subject line

Keep it human and concise.`,
    300
  );

  const emailHtml = await callClaude(
    "Convert to clean HTML email with inline CSS. Dark background (#111), green accents (#22c55e), white text. Output ONLY HTML.",
    `Convert to HTML email:\n${emailContent}`,
    600
  );

  const subjectMatch = emailContent.match(/Subject[:\s]*(.+)/i);
  const subject = subjectMatch
    ? subjectMatch[1].replace(/[*#]/g, "").trim()
    : `We miss you, ${studentName.split(" ")[0]}!`;

  const result = await sendEmail(studentEmail, subject, emailHtml, config);
  console.log("Email — " + result.status);

  logComm(log, {
    timestamp: new Date().toISOString(),
    type: "re-engagement",
    student: { name: studentName, email: studentEmail },
    subject,
    daysSinceLastActive,
    email: { result },
  });

  console.log("Re-engagement complete.");
}

// ─── COMMAND: check-in ───────────────────────────────────────
// Sends a monthly check-in email
async function cmdCheckIn(studentName, studentEmail, tierName, monthNumber) {
  console.log("=== Comms Agent: Monthly Check-In ===");
  console.log(`Student: ${studentName} <${studentEmail}> — ${tierName} tier, month ${monthNumber}`);

  const config = loadConfig();
  const log = loadLog();
  const tier = config.productTiers.find(t => t.name.toLowerCase() === tierName.toLowerCase());

  if (!tier) {
    console.error("Unknown tier: " + tierName + ". Available: " + config.productTiers.map(t => t.name).join(", "));
    process.exit(1);
  }

  const emailContent = await callClaude(
    "Write a monthly check-in email from a coaching brand. Warm, action-oriented, under 150 words.",
    `Write month ${monthNumber} check-in email for ${config.businessName}.
Student: ${studentName} (use first name only)
Tier: ${tier.name} ($${tier.priceUSD}/mo)
Tier includes: ${tier.description}
Business: ${config.businessName} — ${config.tagline}

The email should:
- Celebrate their progress (month ${monthNumber} milestone)
- Suggest one specific action for the coming month
- Remind them of an underused tier benefit
- If month >= 3 and tier is Builder, gently mention the Founder upgrade
- Include a subject line`,
    300
  );

  const emailHtml = await callClaude(
    "Convert to clean HTML email with inline CSS. Dark background (#111), green accents (#22c55e), white text. Output ONLY HTML.",
    `Convert to HTML email:\n${emailContent}`,
    600
  );

  const subjectMatch = emailContent.match(/Subject[:\s]*(.+)/i);
  const subject = subjectMatch
    ? subjectMatch[1].replace(/[*#]/g, "").trim()
    : `Month ${monthNumber} check-in — ${config.businessName}`;

  const result = await sendEmail(studentEmail, subject, emailHtml, config);
  console.log("Email — " + result.status);

  logComm(log, {
    timestamp: new Date().toISOString(),
    type: "monthly-check-in",
    student: { name: studentName, email: studentEmail },
    tier: tier.name,
    monthNumber,
    subject,
    email: { result },
  });

  console.log("Check-in complete.");
}

// ─── CLI ROUTER ──────────────────────────────────────────────
const [command, ...args] = process.argv.slice(2);

const USAGE = `Usage:
  node agents/comms-agent.js onboard    <name> <email> <daysSinceSignup>
  node agents/comms-agent.js re-engage  <name> <email> <daysSinceLastActive>
  node agents/comms-agent.js check-in   <name> <email> <tier> <monthNumber>

Examples:
  node agents/comms-agent.js onboard "Jane Smith" "jane@example.com" 3
  node agents/comms-agent.js re-engage "Jane Smith" "jane@example.com" 21
  node agents/comms-agent.js check-in "Jane Smith" "jane@example.com" "Builder" 2`;

if (!command) {
  console.log(USAGE);
  process.exit(1);
}

switch (command) {
  case "onboard":
    if (args.length < 3) { console.log(USAGE); process.exit(1); }
    cmdOnboard(args[0], args[1], parseInt(args[2])).catch(console.error);
    break;
  case "re-engage":
    if (args.length < 3) { console.log(USAGE); process.exit(1); }
    cmdReEngage(args[0], args[1], parseInt(args[2])).catch(console.error);
    break;
  case "check-in":
    if (args.length < 4) { console.log(USAGE); process.exit(1); }
    cmdCheckIn(args[0], args[1], args[2], parseInt(args[3])).catch(console.error);
    break;
  default:
    console.error("Unknown command: " + command);
    console.log(USAGE);
    process.exit(1);
}
