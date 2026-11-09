#!/usr/bin/env python3
"""Generate every Meridian seed file from one source of truth.

Outputs (all regenerable, all fictional):
  data/seed/*.csv            one CSV per table, for inspection or bulk loading
  sql/04_seed.sql            INSERT statements for Snowflake
  app/fixtures/snapshot.json the same rows, used by the offline store

Run from the project folder:  python3 data/generate_data.py
Every company, person and number here is fictional. Emails and sites use .example.
"""
import csv
import json
import os
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO_TODAY = date(2026, 11, 4)


def d(days_ago):
    return (DEMO_TODAY - timedelta(days=days_ago)).isoformat()


CONFIG = [
    {"config_key": "DEMO_TODAY", "config_value": DEMO_TODAY.isoformat()},
    {"config_key": "MODEL", "config_value": "scripted"},
    {"config_key": "FEE_PCT", "config_value": "15"},
    {"config_key": "CALL_PRICE_USD", "config_value": "0.04"},
    {"config_key": "MAX_VALIDATOR_RETRIES", "config_value": "2"},
]

# ---------------------------------------------------------------- listings
LISTINGS = [
    # id, name, publisher, category, featured, consumer, installs, wau, eval, p95_ms, soc2, refreshed_days_ago, rule_days, price_model, description, keywords
    ("orbit", "GTM Orbit", "Orbit Labs", "Prospecting", 1, 0, 1284, 71, 96.4, 1800, "Type II", None, None, "Usage or annual private offer",
     "Account research, buying signals and first-touch outreach for B2B sellers.", "account research prospect outreach pipeline buying signal sales crm brief call prep"),
    ("conviction", "Conviction AI", "Conviction Labs", "Investing", 1, 0, 612, 66, 94.8, 3600, "Type II", None, None, "Per seat, annual",
     "Investment intelligence for VC and PE firms: cited diligence memos, portfolio monitoring and add-on screening.", "investment intelligence diligence memo venture private equity vc pe portfolio add-on"),
    ("credits", "Credit Simulator", "Credit Simulator", "Pricing", 1, 0, 214, 79, 97.1, 4200, "Type II", None, None, "Annual, per workspace",
     "Simulates moving a seat-based plan to credits using billing and usage history.", "pricing credits usage based seat migration simulation monetization billing"),
    ("readaroo", "Readaroo", "Readaroo", "Consumer", 1, 1, 48200, 58, 95.2, 1100, "Type II", None, None, "Free; fines paid to libraries",
     "An online library: one shelf across library cards, read-tonight search, kid-safe family shelves.", "library books ebook audiobook borrow reading kids family"),
    ("fieldwise", "Fieldwise", "Fieldwise", "Field service", 1, 0, 386, 74, 96.0, 1400, "Type II", None, None, "Per technician, annual",
     "Guided field-service resolution: confirms the exact model before any step, cites the manual page, and hands a reviewer-approved procedure to the technician's phone.",
     "field service repair fault code technician service desk elevator equipment first-time fix manual procedure troubleshooting dispatch"),
    ("purlwise", "Purlwise", "Purlwise", "Hobbies", 0, 1, 31800, 63, 93.0, 900, "Type II", None, None, "Free with paid patterns",
     "Knit and crochet patterns searchable by the yarn you own, resized to your gauge, with a row counter.", "knit knitting crochet pattern yarn gauge row counter craft"),
    ("washbloom", "Wash & Bloom", "Wash & Bloom", "Hobbies", 0, 1, 9700, 47, 91.5, 1300, "Type II", None, None, "Free",
     "Daily watercolor prompts, mixing recipes from your paints, and feedback on a photo of your piece.", "watercolor painting palette mixing art"),
    ("callsight", "Callsight", "Callsight", "Conversation intelligence", 0, 0, 2940, 74, 95.5, 2100, "Type II", None, None, "Per seat",
     "Summarizes sales calls, flags competitor and risk language, suggests one coaching moment per call.", "conversation intelligence call summary coaching competitor objection"),
    ("dealnote", "Dealnote", "Dealnote", "Deal execution", 0, 0, 1870, 69, 94.1, 1900, "Type II", None, None, "Per seat",
     "Turns calls and emails into MEDDICC deal notes, next steps and risks on the opportunity.", "deal notes meddicc qualification next steps crm"),
    ("quotacraft", "Quotacraft", "Quotacraft", "Planning", 0, 0, 540, 61, 92.8, 2600, "Type II", None, None, "Annual",
     "Quota and territory planning from ramp and attrition, with quota letters ready for finance.", "quota planning territory capacity headcount ramp"),
    ("forecastpulse", "Forecast Pulse", "Pulse Analytics", "Forecasting", 0, 0, 1310, 72, 94.6, 2300, "Type II", None, None, "Per seat",
     "Rolls up the weekly forecast and explains every gap between commits and deal evidence.", "forecast commit roll up coverage"),
    ("fieldnote", "Fieldnote Firmographics", "Fieldnote Data", "Data", 0, 0, 3410, 64, 97.9, 600, "Type II", 41, 30, "Per call",
     "Company size, funding, tech stack and hiring signals. Agents call it as a tool.", "firmographic company data enrichment hiring funding"),
    ("pipehealth", "Pipeline Steward", "Steward Ops", "RevOps", 0, 0, 2050, 63, 93.3, 1700, "Type II", None, None, "Usage",
     "Finds stale opportunities and duplicates and proposes fixes in one approval batch.", "revops crm hygiene data quality pipeline duplicates"),
    ("icpscout", "ICP Scout", "Scout Data", "Prospecting", 0, 0, 980, 57, 91.2, 1500, "Not provided", None, None, "Usage",
     "Scores accounts against your ideal customer profile with the top three reasons.", "icp account scoring targeting segmentation"),
    ("winloss", "Win-Loss Lens", "Lens Research", "Conversation intelligence", 0, 0, 760, 41, 92.0, 2800, "Type II", None, None, "Annual",
     "Interviews won and lost buyers by email and trends the reasons by segment.", "win loss analysis competitor interviews"),
    ("renewal", "Renewal Radar", "Radar CS", "Customer success", 0, 0, 1450, 67, 94.0, 1600, "Type II", None, None, "Per seat",
     "Flags renewals at risk from usage drops and drafts a save plan.", "renewal churn retention expansion"),
    ("rampcoach", "Ramp Coach", "Ramp", "Enablement", 0, 0, 1120, 49, 92.4, 2000, "Type II", None, None, "Per seat",
     "30-60-90 plans for new reps with quizzes on real calls.", "enablement onboarding ramp coaching"),
    ("pricewell", "Pricewell", "Pricewell", "Deal execution", 0, 0, 940, 55, 97.8, 1200, "Type II", None, None, "Usage + annual",
     "Builds quotes within discount guardrails and explains exceptions to deal desk.", "quote cpq pricing discount deal desk"),
    ("cosell", "Co-sell Map", "Overlap Labs", "Partnerships", 0, 0, 690, 52, 93.7, 1400, "Type II", None, None, "Annual",
     "Finds account overlap with partners and suggests co-sell plays without sharing raw lists.", "partner co-sell overlap alliances"),
    ("launchpilot", "Launch Pilot", "Pilot GTM", "Enablement", 0, 0, 2875, 36, 90.9, 2200, "Type II", None, None, "Per seat",
     "Turns a launch brief into talk tracks and battlecards and tracks use on calls.", "product launch battlecard talk track"),
]
LISTING_COLS = ["listing_id", "name", "publisher", "category", "featured", "consumer", "installs", "weekly_active_pct",
                "eval_pct", "p95_ms", "soc2", "data_refreshed_on", "freshness_rule_days", "price_model", "description", "keywords"]
listings = []
for r in LISTINGS:
    row = dict(zip(LISTING_COLS, r))
    row["data_refreshed_on"] = d(r[11]) if r[11] is not None else ""
    row["freshness_rule_days"] = r[12] if r[12] is not None else ""
    listings.append(row)

# ---------------------------------------------------------------- tools
TOOLS = [
    ("orbit", "account_brief", "read", "One-page account summary with sources", 2),
    ("orbit", "buying_signals", "read", "Hiring, funding and tech-stack changes", 2),
    ("orbit", "draft_outreach", "read", "First-touch email in the rep's voice", 1),
    ("orbit", "sync_to_crm", "write", "Logs the brief and next step on the account", 1),
    ("conviction", "diligence_memo", "read", "VC: cited memo on market, traction, team and risks", 2),
    ("conviction", "portfolio_monitor", "read", "PE: flags portfolio companies off plan", 2),
    ("conviction", "add_on_screen", "read", "PE: ranks add-on targets for a platform company", 2),
    ("conviction", "export_to_deal_room", "write", "Saves the memo to the deal's folder", 1),
    ("credits", "simulate_migration", "read", "Replays history under a credit price book", 2),
    ("credits", "price_solver", "read", "Finds the credit price for a revenue target", 2),
    ("credits", "segment_impact", "read", "Who pays more or less, by segment", 1),
    ("credits", "publish_price_book", "write", "Saves the new price book for finance review", 1),
    ("fieldwise", "identify_unit", "read", "Checks the case and asks for model and revision before any steps", 1),
    ("fieldwise", "cited_guidance", "read", "Model-specific guidance cited to a manual revision and page", 2),
    ("fieldwise", "past_fixes", "read", "Past cases for the same fault and model, with a denominator", 1),
    ("fieldwise", "start_procedure", "write", "Hands an approved, version-pinned procedure to the assigned technician", 1),
    ("readaroo", "search_tonight", "read", "Titles you can borrow now across all your cards", 1),
    ("readaroo", "borrow_title", "write", "Borrows from whichever card has it first", 1),
    ("readaroo", "family_shelf", "write", "Adds a title to a child's kid-safe shelf", 1),
    ("readaroo", "pay_fine", "link", "Opens Readaroo's own checkout", 0),
]
tools = [dict(zip(["listing_id", "tool_name", "access", "description", "calls_per_run"], t)) for t in TOOLS]

# ---------------------------------------------------------------- workspaces and people
workspaces = [
    {"workspace_id": "nw-freight", "name": "Northwind Freight", "kind": "company", "commitment_remaining_usd": 412800},
    {"workspace_id": "nw-capital", "name": "Northwind Capital", "kind": "company", "commitment_remaining_usd": 250000},
    {"workspace_id": "nw-software", "name": "Northwind Software", "kind": "company", "commitment_remaining_usd": 180000},
    {"workspace_id": "nw-service", "name": "Northwind Field Service", "kind": "company", "commitment_remaining_usd": 120000},
    {"workspace_id": "personal-jordan", "name": "Jordan's personal account", "kind": "personal", "commitment_remaining_usd": 0},
]
members = [
    {"user_id": "jordan", "workspace_id": "nw-freight", "display_name": "Jordan Lee", "email": "jordan.lee@northwind.example", "group_name": "Sales AEs", "is_admin": 0},
    {"user_id": "riley", "workspace_id": "nw-freight", "display_name": "Riley Moss", "email": "riley.moss@northwind.example", "group_name": "Marketing", "is_admin": 0},
    {"user_id": "priya", "workspace_id": "nw-freight", "display_name": "Priya Raman", "email": "priya.raman@northwind.example", "group_name": "IT", "is_admin": 1},
    {"user_id": "marcus", "workspace_id": "nw-freight", "display_name": "Marcus Bell", "email": "marcus.bell@northwind.example", "group_name": "Procurement", "is_admin": 0},
    {"user_id": "avery", "workspace_id": "nw-capital", "display_name": "Avery Chen", "email": "avery.chen@northwind-capital.example", "group_name": "Deal team", "is_admin": 0},
    {"user_id": "noor", "workspace_id": "nw-capital", "display_name": "Noor Haddad", "email": "noor.haddad@northwind-capital.example", "group_name": "IT", "is_admin": 1},
    {"user_id": "sam", "workspace_id": "nw-software", "display_name": "Sam Ortiz", "email": "sam.ortiz@northwind-software.example", "group_name": "Pricing", "is_admin": 0},
    {"user_id": "kai", "workspace_id": "nw-software", "display_name": "Kai Brennan", "email": "kai.brennan@northwind-software.example", "group_name": "IT", "is_admin": 1},
    {"user_id": "ana", "workspace_id": "nw-service", "display_name": "Ana Torres", "email": "ana.torres@northwind-service.example", "group_name": "Service desk", "is_admin": 0},
    {"user_id": "teo", "workspace_id": "nw-service", "display_name": "Teo Varga", "email": "teo.varga@northwind-service.example", "group_name": "Field technicians", "is_admin": 0},
    {"user_id": "omar", "workspace_id": "nw-service", "display_name": "Omar Diaz", "email": "omar.diaz@northwind-service.example", "group_name": "IT", "is_admin": 1},
    {"user_id": "jordan", "workspace_id": "personal-jordan", "display_name": "Jordan Lee", "email": "jordan@home.example", "group_name": "Owner", "is_admin": 1},
]

# installs: Orbit at Northwind Freight starts not purchased, so the demo walks buy -> deploy -> use
installs = [
    {"workspace_id": "nw-freight", "listing_id": "orbit", "status": "not_purchased", "plan": "", "pay_via": "", "spend_cap_usd": 2000, "human_write": 1, "pii_mask": 1, "policy_version": 1, "approved_by": "", "approved_on": ""},
    {"workspace_id": "nw-capital", "listing_id": "conviction", "status": "approved", "plan": "annual", "pay_via": "commitment", "spend_cap_usd": 3000, "human_write": 1, "pii_mask": 1, "policy_version": 3, "approved_by": "noor", "approved_on": "2026-10-12"},
    {"workspace_id": "nw-software", "listing_id": "credits", "status": "approved", "plan": "annual", "pay_via": "invoice", "spend_cap_usd": 1500, "human_write": 1, "pii_mask": 1, "policy_version": 2, "approved_by": "kai", "approved_on": "2026-09-02"},
    {"workspace_id": "nw-service", "listing_id": "fieldwise", "status": "approved", "plan": "annual", "pay_via": "commitment", "spend_cap_usd": 1000, "human_write": 1, "pii_mask": 1, "policy_version": 1, "approved_by": "omar", "approved_on": "2026-11-06"},
    {"workspace_id": "personal-jordan", "listing_id": "readaroo", "status": "approved", "plan": "free", "pay_via": "none", "spend_cap_usd": 0, "human_write": 1, "pii_mask": 0, "policy_version": 1, "approved_by": "jordan", "approved_on": "2026-10-20"},
]
group_policies = [
    {"workspace_id": "nw-freight", "listing_id": "orbit", "group_name": g, "enabled": e}
    for g, e in [("Sales AEs", 1), ("SDRs", 1), ("RevOps", 1), ("Marketing", 0)]
] + [
    {"workspace_id": "nw-capital", "listing_id": "conviction", "group_name": "Deal team", "enabled": 1},
    {"workspace_id": "nw-software", "listing_id": "credits", "group_name": "Pricing", "enabled": 1},
    {"workspace_id": "nw-service", "listing_id": "fieldwise", "group_name": "Service desk", "enabled": 1},
    {"workspace_id": "nw-service", "listing_id": "fieldwise", "group_name": "Field technicians", "enabled": 1},
    {"workspace_id": "personal-jordan", "listing_id": "readaroo", "group_name": "Owner", "enabled": 1},
]
tool_policies = []
for inst in installs:
    for t in tools:
        if t["listing_id"] == inst["listing_id"]:
            enabled = 0 if t["tool_name"] == "sync_to_crm" else 1
            tool_policies.append({"workspace_id": inst["workspace_id"], "listing_id": t["listing_id"], "tool_name": t["tool_name"], "enabled": enabled})

# ---------------------------------------------------------------- prompts and evidence
PROMPTS = [
    ("orbit-brief", "orbit", "account_brief", "Brief me on Halcyon Cold Chain before my 2pm"),
    ("orbit-signals", "orbit", "buying_signals", "Which of my accounts show buying signals this week?"),
    ("orbit-sync", "orbit", "sync_to_crm", "Log this brief and next step to the account"),
    ("conviction-memo", "conviction", "diligence_memo", "VC: draft a diligence memo on Halden Robotics, Series B"),
    ("conviction-portfolio", "conviction", "portfolio_monitor", "PE: which portfolio companies are off plan this quarter?"),
    ("conviction-export", "conviction", "export_to_deal_room", "Export the Halden memo to the deal room"),
    ("credits-sim", "credits", "simulate_migration", "Simulate moving our Pro plan from seats to credits at $0.10"),
    ("credits-solve", "credits", "price_solver", "What credit price keeps revenue flat?"),
    ("credits-publish", "credits", "publish_price_book", "Publish this price book for finance review"),
    ("fieldwise-d17", "fieldwise", "identify_unit", "Case C104: doors keep reopening, code D17. What should the technician do?"),
    ("fieldwise-guide", "fieldwise", "cited_guidance", "Model B, revision 2 is confirmed. What are the approved steps?"),
    ("fieldwise-handoff", "fieldwise", "start_procedure", "Hand the approved procedure to Teo for case C104"),
    ("readaroo-find", "readaroo", "search_tonight", "What can I read tonight on supply chains?"),
    ("readaroo-borrow", "readaroo", "borrow_title", "Borrow The Long Haul Ledger"),
    ("readaroo-kids", "readaroo", "family_shelf", "Add a dinosaur picture book to Maya's shelf"),
    ("readaroo-fine", "readaroo", "pay_fine", "Pay my $3.50 late fine"),
]
prompts = [dict(zip(["prompt_id", "listing_id", "tool_name", "text"], p)) for p in PROMPTS]

# kind: fact (cited), unknown (shown as unknown), uncited (a draft claim the validator must reject),
#       action (what a write does once approved), link (a link-out for consumer payments)
F = []


def fact(prompt_id, claim, source="", as_of="", kind="fact", source_listing=""):
    n = sum(1 for x in F if x["prompt_id"] == prompt_id) + 1
    F.append({"evidence_id": f"EV-{prompt_id.upper()}-{n:02d}", "prompt_id": prompt_id, "claim": claim,
              "source": source, "as_of": as_of, "kind": kind, "source_listing": source_listing})


fact("orbit-brief", "Halcyon Cold Chain: 1,900 employees, Series D; open opportunity $184k at Stage 2.", "CRM.ACCOUNTS A-20931; CRM.OPPS O-7781", d(1))
fact("orbit-brief", "Opened 14 refrigerated-logistics roles in 30 days, mostly in Dallas.", "Fieldnote Firmographics", d(41), source_listing="fieldnote")
fact("orbit-brief", "Replaced their routing vendor in August; that contract renews in Q1.", "Fieldnote Firmographics", d(41), source_listing="fieldnote")
fact("orbit-brief", "Champion Dana Ortiz (VP Ops) attended the Oct 22 webinar.", "CRM.CAMPAIGN_MEMBERS C-1182", "2026-10-22")
fact("orbit-signals", "Halcyon Cold Chain: hiring surge and a routing vendor change.", "Fieldnote Firmographics", d(41), source_listing="fieldnote")
fact("orbit-signals", "Brisa Foods: new CFO who came from a current customer.", "Fieldnote Firmographics", d(41), source_listing="fieldnote")
fact("orbit-signals", "Tern Medical Supply: raised a $60M Series C.", "Fieldnote Firmographics", d(41), source_listing="fieldnote")
fact("orbit-sync", "Logged to account A-20931: brief attached; next step 'Send cutover-risk deck before Nov 12'.", "CRM.ACCOUNTS A-20931", DEMO_TODAY.isoformat(), kind="action")

fact("conviction-memo", "Market: warehouse picking robots, with 4 funded competitors.", "Halden data room, deck p.4", "2026-10-30")
fact("conviction-memo", "Traction: 38 paying sites, up from 11 a year ago.", "PIPELINE.DEALS D-3307; Halden data room, deck p.7", "2026-10-30")
fact("conviction-memo", "Team: founders shipped two prior robotics products.", "Fieldnote Firmographics", d(41), source_listing="fieldnote")
fact("conviction-memo", "Halden will be profitable by 2027.", kind="uncited")
fact("conviction-memo", "Headcount could not be confirmed from the sources available.", kind="unknown")
fact("conviction-portfolio", "Brightwater Pumps: revenue 11% under plan; two delayed municipal contracts.", "PORTFOLIO.KPIS Q3 board pack", "2026-10-15")
fact("conviction-portfolio", "Kinley Dental Group: EBITDA margin 3 points under plan after a new-clinic ramp.", "PORTFOLIO.KPIS Q3 board pack", "2026-10-15")
fact("conviction-export", "Saved 'Halden Robotics Series B memo' to the Halden deal room.", "DEALROOM D-3307", DEMO_TODAY.isoformat(), kind="action")

fact("credits-sim", "Pro plan at $0.10 per credit, 1,240 accounts, 12 months replayed: net revenue -2.1% ($184k less on $8.8M).", "BILLING.INVOICES Nov 2025 to Oct 2026", "2026-10-31")
fact("credits-sim", "61% of accounts pay less, 27% pay more, 8% pay over 10% more.", "Simulation run S-113", DEMO_TODAY.isoformat())
fact("credits-sim", "AI summaries at 5 credits each make up 44% of credits used.", "PRODUCT.USAGE_EVENTS; FEATURE_CREDITS v3", "2026-10-31")
fact("credits-solve", "$0.104 per credit keeps revenue within 0.5% of today.", "Simulation run S-114", DEMO_TODAY.isoformat())
fact("credits-solve", "Light users (under 20 seats) save 9% on average; heavy AI users pay 18% more.", "Simulation run S-114; ACCOUNTS.PLANS", DEMO_TODAY.isoformat())
fact("credits-solve", "41 accounts would see increases over $5k a year.", "Simulation run S-114", DEMO_TODAY.isoformat())
fact("credits-publish", "Saved price book 'Pro credits v1 ($0.104)' for finance review. Nothing changes for customers until finance approves.", "PRICING.PRICE_BOOKS PB-21", DEMO_TODAY.isoformat(), kind="action")

fact("fieldwise-d17", "Case C104 at Harbor Tower, car 2: the caller reported 'doors keep reopening, D17'. Serial SN-48213 is on file.", "CASES C104; ASSETS B002", DEMO_TODAY.isoformat())
fact("fieldwise-d17", "Model and revision are unknown. Two models share code D17 and need different fixes, so no repair steps are given until a person confirms them.", kind="unknown")
fact("fieldwise-guide", "Step 1: read indicator B in the simulator and record green, amber or unreadable.", "Model B service manual MB2, rev 2, p.14", "2026-09-18")
fact("fieldwise-guide", "Step 2: run the B simulator self-test and record its result.", "Model B service manual MB2, rev 2, p.15", "2026-09-18")
fact("fieldwise-guide", "Past D17 cases on Model B rev 2: 1 of 2 ended in a verified recovery; the other was not verified.", "CASE_HISTORY H1, H2", "2026-10-30")
fact("fieldwise-guide", "Approved procedure: 'Indicator, self-test, verify', published by a reviewer and pinned to Model B rev 2.", "PROCEDURES T-IND v1", "2026-10-02")
fact("fieldwise-guide", "This fix works every time on D17.", kind="uncited")
fact("fieldwise-handoff", "Assigned 'Indicator, self-test, verify' (v1, pinned) to Teo for case C104. He can resume it on his phone.", "FIELDWISE.RUNS R-C104", DEMO_TODAY.isoformat(), kind="action")

fact("readaroo-find", "The Long Haul Ledger (ebook): available now on your Riverside card.", "Riverside Public Library catalog", DEMO_TODAY.isoformat())
fact("readaroo-find", "Cold Chain Stories (audiobook): available now on your County card.", "County Library catalog", DEMO_TODAY.isoformat())
fact("readaroo-borrow", "Borrowed The Long Haul Ledger. Due Nov 25, 2026.", "Riverside Public Library loan L-88213", DEMO_TODAY.isoformat(), kind="action")
fact("readaroo-kids", "Added Big Bones, Small Feet to Maya's shelf (ages 4 to 6).", "Readaroo family shelf", DEMO_TODAY.isoformat(), kind="action")
fact("readaroo-fine", "Pay $3.50 to Riverside Public Library on Readaroo's checkout.", "https://readaroo.example/checkout?test=1", DEMO_TODAY.isoformat(), kind="link")
facts = F

# ---------------------------------------------------------------- operator data
submissions = [
    {"submission_id": "S-501", "partner": "Orbit Labs", "listing_name": "GTM Orbit v1.4", "type": "Update", "submitted_on": d(0), "manifest": 1, "scopes": 0, "privacy": 1, "evals": 1, "latency": 1, "injection": 1, "eval_pct": 96.4, "p95_ms": 1800, "risk": "Scope expansion", "note": "Adds crm.write through a new tool. Existing installs keep v1.3 tools until IT re-consents.", "status": "pending"},
    {"submission_id": "S-502", "partner": "Commly", "listing_name": "Comp Clarity", "type": "New", "submitted_on": d(1), "manifest": 1, "scopes": 1, "privacy": 0, "evals": 1, "latency": 1, "injection": 1, "eval_pct": 92.1, "p95_ms": 2400, "risk": "Missing retention terms", "note": "Reads rep commission statements; privacy policy does not say how long they are kept.", "status": "pending"},
    {"submission_id": "S-503", "partner": "Sendwise", "listing_name": "Inbox Autopilot", "type": "New", "submitted_on": d(2), "manifest": 1, "scopes": 1, "privacy": 1, "evals": 0, "latency": 1, "injection": 0, "eval_pct": 84.0, "p95_ms": 3100, "risk": "Fails injection suite", "note": "Followed 3 of 40 planted instructions hidden in prospect replies. Eval pass rate below the 90% bar.", "status": "pending"},
    {"submission_id": "S-504", "partner": "Readaroo", "listing_name": "Readaroo v2.0", "type": "New", "submitted_on": d(0), "manifest": 1, "scopes": 1, "privacy": 1, "evals": 1, "latency": 1, "injection": 1, "eval_pct": 95.2, "p95_ms": 1100, "risk": "Consumer listing", "note": "Passed the all-audience review; payment links out to the partner's checkout.", "status": "pending"},
    {"submission_id": "S-506", "partner": "Fieldwise", "listing_name": "Fieldwise v1.0", "type": "New", "submitted_on": d(0), "manifest": 1, "scopes": 1, "privacy": 1, "evals": 1, "latency": 1, "injection": 1, "eval_pct": 96.0, "p95_ms": 1400, "risk": "Writes to a service system", "note": "start_procedure assigns work to a technician, so it ships off by default and needs a named approver per run.", "status": "pending"},
    {"submission_id": "S-505", "partner": "Callsight", "listing_name": "Callsight Live Coach", "type": "New", "submitted_on": d(0), "manifest": 1, "scopes": 1, "privacy": 1, "evals": 1, "latency": 0, "injection": 1, "eval_pct": 93.5, "p95_ms": 7900, "risk": "Slow p95", "note": "Live hints take 7.9s at p95, past the 5s bar. Can list as post-call coaching only.", "status": "pending"},
]
weeks = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]
bookings = [1420000, 1510000, 1580000, 1740000, 1810000, 1960000, 2080000, 2210000, 2370000]
bookings_weekly = [{"week_start": w, "bookings_usd": b} for w, b in zip(weeks, bookings)]
funnel = [{"ord": i + 1, "stage": s, "count": c} for i, (s, c) in enumerate(
    [("Listing views", 48200), ("Trials started", 6120), ("Purchased", 2310), ("Deployed by IT", 1980), ("Weekly active", 1240)])]
adoption = [
    {"listing_id": "rampcoach", "installs": 1120, "weekly_active_pct": 49, "likely_cause": "Deployed for managers only; the new-hire group was never enabled"},
    {"listing_id": "winloss", "installs": 760, "weekly_active_pct": 41, "likely_cause": "Interview emails land in spam for 18% of installs"},
    {"listing_id": "launchpilot", "installs": 2875, "weekly_active_pct": 36, "likely_cause": "Bought by marketing; reps never see it in their tools"},
]
supply_gaps = [
    {"query": "partner-sourced pipeline attribution", "workspaces": 412},
    {"query": "usage-based pricing quotes", "workspaces": 288},
    {"query": "demo environment setup for sales engineers", "workspaces": 251},
]

TABLES = {
    "config": CONFIG, "listings": listings, "tools": tools, "workspaces": workspaces, "members": members,
    "installs": installs, "group_policies": group_policies, "tool_policies": tool_policies, "prompts": prompts,
    "facts": facts, "submissions": submissions, "bookings_weekly": bookings_weekly, "funnel": funnel,
    "adoption": adoption, "supply_gaps": supply_gaps,
}
SQL_TABLE = {
    "config": "MERIDIAN.OPS.CONFIG", "listings": "MERIDIAN.CORE.LISTINGS", "tools": "MERIDIAN.CORE.TOOLS",
    "workspaces": "MERIDIAN.CORE.WORKSPACES", "members": "MERIDIAN.CORE.MEMBERS", "installs": "MERIDIAN.CORE.INSTALLS",
    "group_policies": "MERIDIAN.CORE.GROUP_POLICIES", "tool_policies": "MERIDIAN.CORE.TOOL_POLICIES",
    "prompts": "MERIDIAN.CORE.PROMPTS", "facts": "MERIDIAN.CORE.FACTS", "submissions": "MERIDIAN.CORE.SUBMISSIONS",
    "bookings_weekly": "MERIDIAN.CORE.BOOKINGS_WEEKLY", "funnel": "MERIDIAN.CORE.FUNNEL",
    "adoption": "MERIDIAN.CORE.ADOPTION", "supply_gaps": "MERIDIAN.CORE.SUPPLY_GAPS",
}


def sql_value(v):
    if v is None or v == "":
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    seed_dir = os.path.join(ROOT, "data", "seed")
    os.makedirs(seed_dir, exist_ok=True)
    for name, rows in TABLES.items():
        with open(os.path.join(seed_dir, f"{name}.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
            w.writeheader()
            w.writerows(rows)

    lines = ["-- 04_seed.sql: GENERATED by data/generate_data.py. Do not edit by hand.",
             "-- Safe to re-run: each table is emptied first. All data is fictional.", ""]
    for name, rows in TABLES.items():
        table = SQL_TABLE[name]
        cols = list(rows[0].keys())
        lines.append(f"DELETE FROM {table};")
        values = ",\n  ".join("(" + ", ".join(sql_value(r[c]) for c in cols) + ")" for r in rows)
        lines.append(f"INSERT INTO {table} ({', '.join(c.upper() for c in cols)}) VALUES\n  {values};")
        lines.append("")
    with open(os.path.join(ROOT, "sql", "04_seed.sql"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    os.makedirs(os.path.join(ROOT, "app", "fixtures"), exist_ok=True)
    with open(os.path.join(ROOT, "app", "fixtures", "snapshot.json"), "w", encoding="utf-8") as f:
        json.dump(TABLES, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"Wrote {len(TABLES)} tables: data/seed/*.csv, sql/04_seed.sql, app/fixtures/snapshot.json")


if __name__ == "__main__":
    main()
