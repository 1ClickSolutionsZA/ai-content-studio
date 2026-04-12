# AI Content Studio — Spawn Template

> A reusable blueprint for launching a new AI-powered content business in under a day.

## Overview

This system uses a pipeline of 6 autonomous AI agents to research a niche, build a brand, generate marketing content, handle fulfillment, manage communications, and monitor operations — all with minimal manual intervention.

**Stack:** Node.js (ESM), Anthropic Claude API, Resend (email), dotenv

**Models used:**
- **Haiku** — all templated/short content (emails, posts, formatting, reports)
- **Sonnet** — strategy, landing pages, welcome packages, content calendars

---

## Agent Pipeline

Run agents in order for a new business. Each reads the output of the previous.

```
1. Research Agent  →  outputs/research.json
2. Setup Agent     →  config/business-config.json + outputs/landing-page.html + outputs/*.json
3. Marketing Agent →  outputs/marketing-content.json
4. Fulfillment Agent  (on-demand per order)
5. Comms Agent        (on-demand per student)
6. Orchestrator       (daily/weekly health check)
```

---

## 1. Research Agent (`npm run research`)

**Purpose:** Analyze a niche and generate a business intelligence document.

**Inputs:** Hardcoded niche keywords (edit `agents/research-agent.js`)
**Outputs:** `outputs/research.json` — summary, blueprint, channels, pricing

**To customize for a new business:**
- Change the research queries/keywords at the top of the file
- Adjust the niche focus in the system prompts

---

## 2. Setup Agent (`npm run setup`)

**Purpose:** Generate all brand assets from research output.

**Inputs:** `outputs/research.json`
**Outputs:**
- `config/business-config.json` — business name, tiers, pricing, audience
- `outputs/landing-page.html` — complete single-file landing page
- `outputs/gumroad-listings.json` — product listing copy per tier
- `outputs/email-sequence.json` — 5-email onboarding sequence
- `outputs/setup-report.json` — manual deployment checklist

**Token budget:** Landing page = 16000, setup report = 1000, config = 600, listings = 400/each, emails = 300/each

**To customize:**
- Edit the fallback business config (lines 41-57) for your defaults
- Change email domain in the prompt
- Adjust tier structure in the prompt

---

## 3. Marketing Agent (`npm run marketing`)

**Purpose:** Generate 30 days of LinkedIn content + 10 cold email templates.

**Inputs:** `outputs/research.json`, `config/business-config.json`
**Outputs:** `outputs/marketing-content.json` containing:
- `contentStrategy` — 30-day calendar (day, theme, hook, topic, CTA)
- `linkedinPosts` — 30 written posts
- `coldEmails` — 10 templates targeting SME owners

**Token budget:** Strategy = 4000 (Sonnet), posts = 400/each (Haiku, batched 6), emails = 300/each (Haiku, batched 5)

**To customize:**
- Change the theme mix ratio in the strategy prompt
- Edit cold email angles array for different pain points
- Adjust batch sizes if hitting rate limits

---

## 4. Fulfillment Agent (`npm run fulfill -- <name> <email> <tier>`)

**Purpose:** Generate and deliver a personalized welcome package for new orders.

**Inputs:** `config/business-config.json`, CLI args (client name, email, tier)
**Outputs:** Appends to `outputs/fulfillment-log.json`

**Workflow:**
1. Match tier from business config
2. Generate welcome package (Sonnet, 1200 tokens)
3. Convert to HTML email (Haiku, 1500 tokens)
4. Send via Resend (or dry-run)
5. Log everything

**Usage:**
```bash
node agents/fulfillment-agent.js "Jane Smith" "jane@example.com" "Builder"
```

---

## 5. Comms Agent (`npm run comms -- <command> <args>`)

**Purpose:** Manage ongoing student communications.

**Inputs:** `outputs/email-sequence.json`, `config/business-config.json`, CLI args
**Outputs:** Appends to `outputs/comms-log.json`

**Commands:**

| Command | Args | Schedule |
|---------|------|----------|
| `onboard` | name, email, daysSinceSignup | Day 1, 3, 5, 7, 14 |
| `re-engage` | name, email, daysSinceLastActive | On-demand |
| `check-in` | name, email, tier, monthNumber | Monthly |

**Features:**
- Idempotent onboarding (checks log before sending)
- Re-engagement generates unique content per student
- Check-in suggests tier upgrades at month 3+

**Usage:**
```bash
node agents/comms-agent.js onboard "Jane Smith" "jane@example.com" 7
node agents/comms-agent.js re-engage "Jane Smith" "jane@example.com" 21
node agents/comms-agent.js check-in "Jane Smith" "jane@example.com" "Builder" 3
```

---

## 6. Orchestrator (`npm run orchestrate`)

**Purpose:** Daily health check, metrics dashboard, and weekly report.

**Inputs:** All output files + config
**Outputs:** `outputs/weekly-report.json`, console summary

**What it checks:**
- Agent output file freshness (warns if >7 days old)
- Total students, estimated revenue, tier breakdown
- Email delivery stats (sent/failed/dry-run)
- Content calendar progress
- Overdue onboarding emails (flags with exact remediation command)
- Fulfillment delivery errors
- Suggests next LinkedIn post to publish

---

## Spawning a New Business

### Step 1: Clone and configure

```bash
git clone https://github.com/1ClickSolutionsZA/ai-content-studio.git my-new-business
cd my-new-business
npm install
```

### Step 2: Set environment variables

Create `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...          # optional, enables live email
```

### Step 3: Customize the niche

Edit `agents/research-agent.js`:
- Change search queries to your target niche
- Adjust audience descriptions

### Step 4: Run the pipeline

```bash
npm run research          # Generate market research
npm run setup             # Build brand assets
npm run marketing         # Create 30-day content plan
npm run orchestrate       # Verify everything is healthy
```

### Step 5: Go live

1. Deploy `outputs/landing-page.html` to Netlify
2. Create Gumroad products using `outputs/gumroad-listings.json`
3. Configure Resend domain for email delivery
4. Add `RESEND_API_KEY` to `.env`
5. Run orchestrator daily: `npm run orchestrate`

### Step 6: Operate

```bash
# New order comes in:
npm run fulfill -- "Client Name" "email@x.com" "Builder"

# Daily comms (run via cron or manually):
npm run comms -- onboard "Client" "email@x.com" <days>

# Weekly check:
npm run orchestrate
```

---

## File Structure

```
ai-content-studio/
├── agents/
│   ├── research-agent.js      # Niche research + BI doc
│   ├── setup-agent.js         # Brand asset generation
│   ├── marketing-agent.js     # Content + cold email generation
│   ├── fulfillment-agent.js   # Welcome package + delivery
│   ├── comms-agent.js         # Onboarding, re-engage, check-in
│   └── orchestrator.js        # Health check + weekly report
├── config/
│   └── business-config.json   # Central business configuration
├── outputs/
│   ├── research.json          # Market research data
│   ├���─ setup-report.json      # Deployment checklist
│   ├── landing-page.html      # Complete landing page
│   ├── gumroad-listings.json  # Product listing copy
│   ├── email-sequence.json    # 5-email onboarding sequence
│   ├── marketing-content.json # 30 posts + 10 cold emails
│   ├── fulfillment-log.json   # Delivery records
│   ├── comms-log.json         # Communication records
│   └── weekly-report.json     # Orchestrator report
├── docs/
│   └── SPAWN_TEMPLATE.md      # This file
├── .env                       # API keys (not committed)
└── package.json
```

---

## Token Budget Reference

| Agent | Model | Token Limit | Notes |
|-------|-------|------------|-------|
| Research | Haiku + Sonnet | 800-2000 | Web search + synthesis |
| Setup — config | Haiku | 600 | JSON generation |
| Setup — landing page | Sonnet | 16000 | Full HTML/CSS/JS |
| Setup — listings | Haiku | 400/each | 3 tiers |
| Setup — emails | Haiku | 300/each | 5 emails |
| Setup — report | Haiku | 1000 | Deployment checklist |
| Marketing — strategy | Sonnet | 4000 | 30-day calendar JSON |
| Marketing — posts | Haiku | 400/each | Batched 6 at a time |
| Marketing — cold emails | Haiku | 300/each | Batched 5 at a time |
| Fulfillment — welcome | Sonnet | 1200 | Personalized package |
| Fulfillment — HTML | Haiku | 1500 | Email formatting |
| Comms — all | Haiku | 300-800 | Templated emails |
| Orchestrator | Haiku | 600 | Weekly report |

---

## Rate Limit Notes

- Batch concurrent API calls (5-6 max) to avoid 429 errors
- The marketing agent batches LinkedIn posts in groups of 6, cold emails in groups of 5
- If you hit rate limits, reduce batch sizes or add delays between batches
