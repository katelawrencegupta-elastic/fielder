// Seed the GE Vernova Observability POC plan into Fielder.
// Idempotent: skips if a POC with folder_name "GEVernova_Observability" already exists.
//
// Usage (from the fielder/ root):
//   node server/scripts/seed-gev-poc.js
//   node server/scripts/seed-gev-poc.js --force   # re-creates even if already seeded

const { db, get, run, all, now } = require("../db/helpers");
const { seed } = require("../db/seed");

seed(); // ensure accounts/stages exist

const ACCOUNT_KEY = "ge_vernova";
const FOLDER_NAME = "GEVernova_Observability";

const args = process.argv.slice(2);
const force = args.includes("--force");

// ── Guard ─────────────────────────────────────────────────────────────────────
const existing = get("SELECT id FROM pocs WHERE folder_name = ?", FOLDER_NAME);
if (existing && !force) {
  console.log(`POC "${FOLDER_NAME}" already exists (id=${existing.id}). Run with --force to re-seed.`);
  process.exit(0);
}
if (existing && force) {
  console.log(`--force: deleting existing POC id=${existing.id} and its tasks/epics…`);
  run("DELETE FROM tasks WHERE poc_id = ?", existing.id);
  // Delete epics that belong to this account and were seeded (no safe FK cascade here)
  run("DELETE FROM epics WHERE account_key = ? AND description LIKE '%GEV-POC-SEED%'", ACCOUNT_KEY);
  run("DELETE FROM pocs WHERE id = ?", existing.id);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ts = now();

function insertPoc({ folderName, title, status, startDate, targetDemoDate, owner }) {
  const info = run(
    `INSERT INTO pocs (folder_name, account_key, title, status, start_date, target_demo_date, owner, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    folderName, ACCOUNT_KEY, title, status,
    startDate ?? null, targetDemoDate ?? null, owner ?? null,
    ts, ts
  );
  return info.lastInsertRowid;
}

function insertEpic({ title, description }) {
  const info = run(
    `INSERT INTO epics (title, description, account_key, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    title, description ?? "GEV-POC-SEED", ACCOUNT_KEY, ts, ts
  );
  return info.lastInsertRowid;
}

let positionCounter = 0;
function insertTask({ title, description, epicId, pocId, stage, startDate, dueDate, labels, subtasks }) {
  const pos = positionCounter++;
  const info = run(
    `INSERT INTO tasks (title, description, account_key, epic_id, poc_id, stage_key, category, start_date, due_date, position, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'general', ?, ?, ?, 'manual', ?, ?)`,
    title, description ?? null, ACCOUNT_KEY,
    epicId ?? null, pocId ?? null,
    stage ?? "backlog",
    startDate ?? null, dueDate ?? null,
    pos, ts, ts
  );
  const taskId = info.lastInsertRowid;
  (labels ?? []).forEach((l) =>
    run("INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)", taskId, l)
  );
  (subtasks ?? []).forEach((text, i) =>
    run("INSERT INTO subtasks (task_id, text, done, position, created_at) VALUES (?, ?, 0, ?, ?)", taskId, text, i, ts)
  );
  return taskId;
}

// ── Main transaction ──────────────────────────────────────────────────────────
db.transaction(() => {

  // POC record
  const pocId = insertPoc({
    folderName: FOLDER_NAME,
    title: "GE Vernova Observability POC",
    status: "planning",
    startDate: "2025-08-01",
    targetDemoDate: null,
    owner: "Kate Lawrence-Gupta",
  });

  // ── Epic 0: Pre-Kickoff & Setup ─────────────────────────────────────────────
  const e0 = insertEpic({
    title: "Pre-Kickoff & Setup",
    description: "GEV-POC-SEED — Environment access, logistics, and alignment sessions before the POC starts.",
  });

  insertTask({
    title: "Run DIMA + Data Inventory query from license server",
    description: "Run the license manager query to inventory GEV's data estate. Enables synthetic data generation, identifies unused assets, shows how heavily each source is used, and gives Elastic the input needed to estimate conversion effort and services scope.\n\nQuery:\n```\nearliest=-30d@d index=_* source=\"*license*\" | bucket _time span=1d | eval gb=round(b/1024/1024/1024,2) | stats sum(gb) by _time, st, i\n```",
    epicId: e0, pocId,
    stage: "backlog",
    labels: ["data-inventory", "dima"],
    subtasks: [
      "Confirm David Rutstein (GEV) + Jamie (Elastic) are aligned on running the query",
      "Clarify whether application traces are captured by this query or need a separate pull",
      "Share inventory JSON with Elastic once complete",
    ],
  });

  insertTask({
    title: "Request trial account POC funding",
    description: "Submit the POC funding form via Brad (Elastic). GEV has already sent their Org ID and email.",
    epicId: e0, pocId,
    stage: "in_progress",
    labels: ["logistics"],
    subtasks: [
      "(DONE) GEV sent Elastic their Org ID (cloud console) and email address",
      "Brad (Elastic) to finalize and submit funding form",
    ],
  });

  insertTask({
    title: "Confirm trial account connectivity & IP exceptions",
    description: "GE Vernova connects via private link (confirmed). Elastic employee IP exceptions still pending.",
    epicId: e0, pocId,
    stage: "in_progress",
    labels: ["logistics", "network"],
    subtasks: [
      "(DONE) GE Vernova connects via private link",
      "Give Elastic IP exceptions for distinct Elastic employee IP addresses (pending — Udit, GEV)",
    ],
  });

  insertTask({
    title: "GEV setup Teams channel for POC collaboration",
    description: "Udit (GEV) to create a shared Microsoft Teams channel for POC comms.",
    epicId: e0, pocId,
    stage: "backlog",
    labels: ["logistics"],
    subtasks: [
      "Udit (GEV) creates channel",
      "Add all Elastic POC team members",
    ],
  });

  insertTask({
    title: "Box folder collaboration set up",
    description: "Shared Box folder between GEV and Elastic for POC artefacts.",
    epicId: e0, pocId,
    stage: "done",
    labels: ["logistics"],
  });

  insertTask({
    title: "GE Vernova create serverless trial account",
    description: "GEV provisioned their Elastic serverless trial account.",
    epicId: e0, pocId,
    stage: "done",
    labels: ["logistics"],
  });

  insertTask({
    title: "Pre-kickoff session: SRE team — validate AI & agentic test criteria",
    description: "Session with GEV SRE team to validate and agree test cases in §7 before the POC starts. Must resolve: RCA incident scenario, runbook actions definition, anomaly detection signals, and what 'Nightshift' means.",
    epicId: e0, pocId,
    stage: "backlog",
    labels: ["alignment", "ai-workflows"],
    subtasks: [
      "Pick one RCA incident scenario the SREs recognize",
      "Define which dashboard + alert set is the runbook automation testbed",
      "Agree which runbook actions count as 'automated' (notify / ticket / webhook / remediation)",
      "Identify signals for anomaly detection jobs",
      "Clarify 'Nightshift' — off-hours autonomous triage, or something else?",
      "Pick a dashboard and alert set to test against",
    ],
  });

  insertTask({
    title: "Pre-kickoff session: App team — validate LLM-as-judge criteria",
    description: "Session with GEV app team to define TC7.5 (LLM-as-judge workflow). Must agree: which LLM apps are in scope, what is being judged, what criteria, where eval results land.",
    epicId: e0, pocId,
    stage: "backlog",
    labels: ["alignment", "ai-workflows"],
    subtasks: [
      "Identify which LLM apps are in scope",
      "Define what is being judged and success criteria",
      "Agree where eval results should land in Elastic",
    ],
  });

  insertTask({
    title: "Smoke test routing OTEL data to mOTEL endpoint",
    description: "Verify OTel data routes correctly to the managed OTel (mOTEL) endpoint before the POC kicks off.",
    epicId: e0, pocId,
    stage: "backlog",
    labels: ["otel", "ingest"],
  });

  // ── Epic 1: Cost & Sizing Validation ────────────────────────────────────────
  const e1 = insertEpic({
    title: "§1 Cost & Sizing Validation",
    description: "GEV-POC-SEED — Load 1-2 real sources at 10-20% of a busy weekday, measure metered ingest, extrapolate to full volume.",
  });

  insertTask({
    title: "TC1.1 — Load agreed sources, measure metered ingest",
    description: "Load 1–2 agreed sources for a defined window (12–24 hrs). Metered GB must be within ±10% of the pre-load estimate.",
    epicId: e1, pocId,
    stage: "backlog",
    labels: ["cost-sizing", "tc"],
    subtasks: [
      "Agree which 2 sources best represent GEV's volume mix",
      "Confirm serverless vs. ECH (changes the metering story — flag before loading)",
      "Identify a representative weekday and get Splunk-side daily volumes for those sources",
      "Define acceptable variance tolerance (propose ±10%)",
      "Run load for 12–24 hrs and record metered GB",
    ],
  });

  insertTask({
    title: "TC1.2 — Extrapolation model review & FinOps sign-off",
    description: "Walk GEV FinOps owner through the extrapolation model (partial window → daily → monthly). Pass: projection ≤ RFP sizing, or variance explained and accepted.",
    epicId: e1, pocId,
    stage: "backlog",
    labels: ["cost-sizing", "tc"],
    subtasks: [
      "Identify who owns FinOps sign-off at GEV",
      "Build extrapolation model from TC1.1 measured data",
      "Present pricing walkthrough — math is theirs, not ours",
      "Obtain written sign-off from FinOps owner",
    ],
  });

  insertTask({
    title: "TC1.3 — Serverless metering demonstration",
    description: "Demonstrate how serverless metering works (billed on enriched, uncompressed bytes at the front door — raw Splunk GB ≠ billed GB). Pass: GEV can articulate what a billed GB is. Eliminates the 'anomaly' fear.",
    epicId: e1, pocId,
    stage: "backlog",
    labels: ["cost-sizing", "tc"],
    subtasks: [
      "Prepare live demo of serverless metering in the cloud console",
      "Confirm GEV contact can correctly explain what a billed GB is after the session",
    ],
  });

  // ── Epic 2: Ingest Path (Splunk + OTel) ─────────────────────────────────────
  const e2 = insertEpic({
    title: "§2 Ingest Path — Splunk + OTel",
    description: "GEV-POC-SEED — Heavy forwarder dual-feed fork from Splunk + OTel traces/metrics/logs via native OTLP endpoint. Explore log↔trace correlation.",
  });

  insertTask({
    title: "Test deploying heavy forwarders to dual-feed logs from Splunk",
    description: "Deploy heavy forwarder per Luke Netto's pattern: Splunk pipeline untouched, fork feeds Elastic Agent. David Rutstein (GEV) + Kate (Elastic) own this.",
    epicId: e2, pocId,
    stage: "backlog",
    labels: ["ingest", "splunk"],
    subtasks: [
      "Confirm GEV can deploy heavy forwarders (change-control lead time?)",
      "Confirm network egress from GEV to Elastic Cloud is approved",
      "Identify who on GEV's side owns forwarder config",
    ],
  });

  insertTask({
    title: "TC2.1 — Dual-feed live, Splunk pipeline untouched",
    description: "Dual-feed running with zero impact to Splunk. Pass: event counts match Splunk-side over the same window with zero loss.",
    epicId: e2, pocId,
    stage: "backlog",
    labels: ["ingest", "tc"],
    subtasks: [
      "Deploy heavy forwarder fork",
      "Compare event counts between Splunk and Elastic over a defined window",
      "Confirm zero loss and no Splunk disruption",
    ],
  });

  insertTask({
    title: "TC2.2 — Parsing fidelity: timestamps, source mapping, no truncation",
    description: "Pass: GEV SME spot-checks the ingested data and signs off on timestamps, source field mapping, and absence of truncation.",
    epicId: e2, pocId,
    stage: "backlog",
    labels: ["ingest", "tc"],
    subtasks: [
      "Identify GEV SME who will perform spot-check",
      "Define spot-check criteria (timestamp accuracy, field mapping, truncation test)",
      "Obtain sign-off",
    ],
  });

  insertTask({
    title: "TC2.3 — OTel traces flowing via native OTLP endpoint",
    description: "Pass: traces render in APM UI (service map, latency, errors) alongside OTel metrics.",
    epicId: e2, pocId,
    stage: "backlog",
    labels: ["otel", "apm", "tc"],
    subtasks: [
      "Identify which GEV services emit OTel traces today and at what volume",
      "Confirm sampling configuration is in place",
      "Route traces to native OTLP endpoint",
      "Verify service map, latency, and error views render in APM UI",
    ],
  });

  insertTask({
    title: "TC2.4 — Log↔trace correlation via trace.id / span.id in log events",
    description: "Pass: can pivot from a log line → trace and from a trace → logs in the UI for at least one instrumented service. This is also a prerequisite for TC7.2 (RCA agent demo).",
    epicId: e2, pocId,
    stage: "backlog",
    labels: ["otel", "correlation", "tc"],
    subtasks: [
      "Determine whether GEV apps already inject trace.id / span.id into log events",
      "If not: identify logging frameworks in use and assess feasibility of enabling OTel log correlation in the POC window",
      "Enable correlation for at least one service",
      "Verify log→trace and trace→log pivots work in the UI",
    ],
  });

  // ── Epic 3: Migration Confidence (DIMA) ─────────────────────────────────────
  const e3 = insertEpic({
    title: "§3 Migration Confidence — DIMA + Inventory",
    description: "GEV-POC-SEED — Run DIMA inventory scripts, convert 2 dashboards + sample alerts. Classify full estate: converts clean / needs work / blocker.",
  });

  insertTask({
    title: "TC3.1 — DIMA inventory rendered from GEV's JSON",
    description: "Pass: GEV confirms the rendered inventory is complete and accurate.",
    epicId: e3, pocId,
    stage: "backlog",
    labels: ["migration", "dima", "tc"],
    subtasks: [
      "Confirm GEV can run DIMA inventory scripts independently, or do they need Elastic hands-on?",
      "Receive and ingest JSON output",
      "Render inventory and present to GEV for confirmation",
    ],
  });

  insertTask({
    title: "TC3.2 — Convert two priority dashboards",
    description: "Pass: dashboard owner confirms functional parity (not pixel parity — set expectation explicitly).",
    epicId: e3, pocId,
    stage: "backlog",
    labels: ["migration", "dashboards", "tc"],
    subtasks: [
      "Identify which 2–3 dashboards are business-critical (work backward to required sources)",
      "Identify any SPL macros/lookups those dashboards depend on",
      "Convert dashboards",
      "Get functional parity sign-off from dashboard owner",
    ],
  });

  insertTask({
    title: "TC3.3 — Convert sample alerts and fire on test conditions",
    description: "Pass: correct trigger + notification routing for converted alerts.",
    epicId: e3, pocId,
    stage: "backlog",
    labels: ["migration", "alerts", "tc"],
    subtasks: [
      "Identify which alerts are business-critical",
      "Convert sample alerts",
      "Fire alerts on test conditions and verify trigger + routing",
    ],
  });

  insertTask({
    title: "TC3.4 — Deliver full-inventory classification",
    description: "Pass: GEV agrees that residual (blocker / needs work) = services scope. Explicit classification: converts clean / needs work / blocker.",
    epicId: e3, pocId,
    stage: "backlog",
    labels: ["migration", "tc"],
    subtasks: [
      "Classify all inventory items: converts clean / needs work / blocker",
      "Present classification to GEV",
      "Get agreement that residual = services scope (migration execution is out of POC scope)",
    ],
  });

  // ── Epic 4: Functionality — Synthetic Data ───────────────────────────────────
  const e4 = insertEpic({
    title: "§4 Functionality — Synthetic Data",
    description: "GEV-POC-SEED — FinOps cloud-cost + LLM-cost views and alerting at volume on generated data.",
  });

  insertTask({
    title: "TC4.1 — FinOps cloud-cost + LLM-cost dashboards on synthetic data",
    description: "FinOps is GEV's hot button. Build and demo cloud-cost + LLM-cost dashboards on synthetic data — timeline doesn't hinge on ingest.",
    epicId: e4, pocId,
    stage: "backlog",
    labels: ["finops", "dashboards", "tc"],
    subtasks: [
      "Identify which cloud providers and cost sources feed GEV's FinOps view today",
      "Generate synthetic cost data at representative volume",
      "Build cloud-cost dashboard",
      "Build LLM-cost dashboard",
    ],
  });

  insertTask({
    title: "TC4.2 — Alert rules trigger and route at synthetic volume",
    description: "Pass: alert rules fire and route correctly under synthetic load.",
    epicId: e4, pocId,
    stage: "backlog",
    labels: ["alerts", "tc"],
    subtasks: [
      "Determine alert volume/types GEV currently runs",
      "Configure alert rules against synthetic data",
      "Verify trigger and notification routing end-to-end",
    ],
  });

  // ── Epic 5: Usability ────────────────────────────────────────────────────────
  const e5 = insertEpic({
    title: "§5 Usability",
    description: "GEV-POC-SEED — GEV users live in the sandbox for POC duration to directly validate daily workflow comfort.",
  });

  insertTask({
    title: "TC5.1 — Named users complete daily workflows unassisted",
    description: "GEV's named users should be able to complete their daily workflows unassisted in the Elastic sandbox. POC duration is 'long enough'.",
    epicId: e5, pocId,
    stage: "backlog",
    labels: ["usability", "tc"],
    subtasks: [
      "Identify named users and their daily workflows",
      "Define 'long enough' — bound to POC duration",
      "Run unassisted workflow sessions and document results",
    ],
  });

  insertTask({
    title: "TC5.2 — Common SPL searches converted to ES|QL, results validated",
    description: "Pass: ES|QL query results match Splunk output, and the user validates.",
    epicId: e5, pocId,
    stage: "backlog",
    labels: ["usability", "esql", "tc"],
    subtasks: [
      "Collect top SPL searches GEV users run daily",
      "Convert each to ES|QL",
      "Run side-by-side comparison and get user sign-off",
    ],
  });

  // ── Epic 6: Performance ──────────────────────────────────────────────────────
  const e6 = insertEpic({
    title: "§6 Performance",
    description: "GEV-POC-SEED — Dashboard query response and ingest throughput at test-window volume.",
  });

  insertTask({
    title: "TC6.1 — Dashboard query response meets agreed threshold",
    description: "Pass: dashboard queries respond within the threshold GEV names. Get them to commit to a number — don't let this stay vague.",
    epicId: e6, pocId,
    stage: "backlog",
    labels: ["performance", "tc"],
    subtasks: [
      "Get GEV to name a query response threshold (e.g. <5s for dashboards)",
      "Identify peak concurrent users",
      "Run dashboard queries at loaded volume and measure response times",
      "Document any current Splunk performance pain (slow/skipped searches) for comparison",
    ],
  });

  insertTask({
    title: "TC6.2 — Ingest sustains test-window rate with no lag or backlog",
    description: "Pass: ingest pipeline holds the test-window rate with no measurable lag or backlog.",
    epicId: e6, pocId,
    stage: "backlog",
    labels: ["performance", "ingest", "tc"],
    subtasks: [
      "Confirm test-window ingest rate (from TC1.1 data)",
      "Monitor ingest pipeline during test window for lag/backlog",
    ],
  });

  // ── Epic 7: AI & Agentic Workflows ───────────────────────────────────────────
  const e7 = insertEpic({
    title: "§7 AI & Agentic Workflows",
    description: "GEV-POC-SEED — AI Assistant authoring, agentic RCA, runbook automation, anomaly detection, LLM-as-judge. Criteria to be validated in pre-kickoff sessions.",
  });

  insertTask({
    title: "TC7.1 — Gen AI Assistant: create chart and alert rule via natural language",
    description: "SRE user creates a visualization and an alert rule using natural-language prompts in the AI Assistant. Pass: both work without manual query writing.",
    epicId: e7, pocId,
    stage: "backlog",
    labels: ["ai", "assistant", "tc"],
    subtasks: [
      "Identify SRE user who will run the demo",
      "Prepare demo scenario (what chart, what alert)",
      "Run live: create chart via AI Assistant prompt",
      "Run live: create alert rule via AI Assistant prompt",
    ],
  });

  insertTask({
    title: "TC7.2 — RCA workflow via Agent Builder on correlated data",
    description: "Agent built with AI Assistant, run against a staged incident. Requires TC2.4 (log↔trace correlation). Pass: agent surfaces root cause with supporting evidence across logs/traces/metrics.",
    epicId: e7, pocId,
    stage: "backlog",
    labels: ["ai", "rca", "agent-builder", "tc"],
    subtasks: [
      "Pick one incident scenario GEV SREs recognize (validate in pre-kickoff session)",
      "Confirm TC2.4 (log↔trace correlation) is complete before attempting this TC",
      "Build RCA agent in Agent Builder using AI Assistant",
      "Stage the incident scenario",
      "Run agent and verify root-cause output with supporting evidence",
    ],
  });

  insertTask({
    title: "TC7.3 — Runbook automation: alert → runbook action end-to-end",
    description: "Pass: full chain documented — trigger → action → outcome. Runbook actions agreed in pre-kickoff SRE session.",
    epicId: e7, pocId,
    stage: "backlog",
    labels: ["ai", "runbook", "tc"],
    subtasks: [
      "Agree which alert set is the automation testbed (pre-kickoff SRE session)",
      "Define what 'automated' means for this set (notify / ticket / webhook / remediation)",
      "Configure alert → runbook connector chain",
      "Fire alert and verify full chain executes",
      "Document trigger → action → outcome",
    ],
  });

  insertTask({
    title: "TC7.4 — Anomaly detection jobs on agreed signals",
    description: "Pass: SRE team confirms anomalies surfaced are meaningful and noise level is acceptable. Run on loaded/synthetic data.",
    epicId: e7, pocId,
    stage: "backlog",
    labels: ["ai", "anomaly-detection", "tc"],
    subtasks: [
      "Agree which signals to run anomaly detection on (pre-kickoff SRE session)",
      "Configure ML anomaly detection jobs",
      "Run on loaded/synthetic data",
      "Review results with SRE team — confirm signal quality and noise level",
    ],
  });

  insertTask({
    title: "TC7.5 — LLM-as-judge: GenAI telemetry captured and eval scores dashboarded",
    description: "Pass: app team validates the workflow shape. Criteria set in pre-kickoff app-team session — placeholder until then.",
    epicId: e7, pocId,
    stage: "backlog",
    labels: ["ai", "llm-as-judge", "tc"],
    subtasks: [
      "Complete pre-kickoff app team session to define criteria (TC7.5 is a placeholder until then)",
      "Capture LLM app telemetry as GenAI traces",
      "Land judge eval scores in Elastic",
      "Build dashboard/alert over eval scores",
      "Validate workflow shape with app team",
    ],
  });

  // ── Epic 8: Governance & Success Criteria ────────────────────────────────────
  const e8 = insertEpic({
    title: "§8 Governance & Success Criteria",
    description: "GEV-POC-SEED — Success criteria doc, sign-off owners per TC, reference call.",
  });

  insertTask({
    title: "Circulate success criteria doc for markup and agreement before kickoff",
    description: "AI-structured doc from call notes circulated to GEV for markup. Every TC gets a named customer sign-off owner — that's what turns 'warm and fuzzy' into a checkbox.",
    epicId: e8, pocId,
    stage: "backlog",
    labels: ["governance"],
    subtasks: [
      "Draft success criteria doc from call notes",
      "Assign a named sign-off owner per TC",
      "Circulate to GEV for markup",
      "Incorporate feedback and get final agreement before kickoff",
    ],
  });

  insertTask({
    title: "Identify and schedule Splunk-displacement reference call",
    description: "Pair the POC with a reference call from a Splunk-to-Elastic customer. Assess whether Pepsi is still viable or go with Vanguard.",
    epicId: e8, pocId,
    stage: "backlog",
    labels: ["governance", "reference"],
    subtasks: [
      "Confirm Pepsi is still viable as a reference — if not, use Vanguard",
      "Schedule reference call with GEV decision-makers",
    ],
  });

  insertTask({
    title: "Determine data source subset to move over and continuous loading plan",
    description: "Agree with GEV on which subset of data sources to move during the POC and the continuous loading strategy.",
    epicId: e8, pocId,
    stage: "backlog",
    labels: ["governance", "ingest"],
    subtasks: [
      "Review DIMA inventory output",
      "Identify 1–2 sources for live ingest (cost proof) vs. synthetic-only",
      "Define continuous loading rate and duration",
    ],
  });

})();

console.log(`\n✓ GE Vernova POC seeded successfully into Fielder.`);
console.log(`  POC folder: ${FOLDER_NAME}`);
console.log(`  Account:    ${ACCOUNT_KEY}`);
console.log(`  Run "node server/scripts/seed-gev-poc.js --force" to re-seed.\n`);
