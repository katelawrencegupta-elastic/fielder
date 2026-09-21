# GE Vernova Observability POC — Week of Aug 10–16, 2026

status planning · account ge_vernova · owner Kate Lawrence-Gupta · 2025-08-01 → — · notes https://docs.google.com/document/d/1YgE2fsHJyU-fTbRiroBisCIPhyuKAZ_x6Orex578McE/edit?usp=sharing · repo https://github.com/katelawrencegupta-elastic/poc/tree/main/GEVernova_Observability

28 card updates · 2 commits · 34 touched cards · 1 overdue · 36 on board

## Overdue

- **YAML block > Shoeb for OTEL configuration** — Pending · GE Vernova Observability POC · due Aug 10 · overdue, due this week, updated

## Touched / due in period

- **TC3.2 — Convert two priority dashboards** — tc3 · Workstream #1 · GE Vernova Observability POC · subtasks 0/3 · labels: dashboards, migration, tc · updated
  Pass: dashboard owner confirms functional parity (not pixel parity — set expectation explicitly).
- **TC4.1 — FinOps cloud-cost + LLM-cost dashboards on synthetic data** — tc4 · Workstream #2 · GE Vernova Observability POC · subtasks 0/4 · labels: dashboards, finops, tc · updated
  FinOps is GEV's hot button. Build and demo cloud-cost + LLM-cost dashboards on synthetic data — timeline doesn't hinge on ingest.
- **TC5.1 — Named users complete daily workflows unassisted** — tc5 · Workstream #1 · GE Vernova Observability POC · subtasks 0/3 · labels: tc, usability · updated
  GEV's named users should be able to complete their daily workflows unassisted in the Elastic sandbox. POC duration is 'long enough'.
- **TC6.1 — Dashboard query response meets agreed threshold** — tc6 · Workstream #1 · GE Vernova Observability POC · subtasks 0/4 · labels: performance, tc · updated
  Pass: dashboard queries respond within the threshold GEV names. Get them to commit to a number — don't let this stay vague.
- **TC7.1 — Gen AI Assistant: create chart and alert rule via natural language** — tc7 · Workstream #3 · GE Vernova Observability POC · subtasks 0/4 · labels: ai, assistant, tc · updated
  SRE user creates a visualization and an alert rule using natural-language prompts in the AI Assistant. Pass: both work without manual query writing.
- **TC3.3 — Convert sample alerts and fire on test conditions** — tc3 · Workstream #1 · GE Vernova Observability POC · subtasks 0/3 · labels: alerts, migration, tc · updated
  Pass: correct trigger + notification routing for converted alerts.
- **TC4.2 — Alert rules trigger and route at synthetic volume** — tc4 · Workstream #2 · GE Vernova Observability POC · subtasks 0/3 · labels: alerts, tc · updated
  Pass: alert rules fire and route correctly under synthetic load.
- **TC6.2 — Ingest sustains test-window rate with no lag or backlog** — tc6 · Workstream #1 · GE Vernova Observability POC · subtasks 0/2 · labels: ingest, performance, tc · updated
  Pass: ingest pipeline holds the test-window rate with no measurable lag or backlog.
- **TC7.2 — RCA workflow via Agent Builder on correlated data** — tc7 · Workstream #3 · GE Vernova Observability POC · subtasks 0/5 · labels: agent-builder, ai, rca, tc · updated
  Agent built with AI Assistant, run against a staged incident. Requires TC2.4 (log↔trace correlation). Pass: agent surfaces root cause with supporting evidence across logs/traces/metrics.
- **TC3.4 — Deliver full-inventory classification** — tc3 · Workstream #1 · GE Vernova Observability POC · subtasks 0/3 · labels: migration, tc · updated
  Pass: GEV agrees that residual (blocker / needs work) = services scope. Explicit classification: converts clean / needs work / blocker.
- **TC7.3 — Runbook automation: alert → runbook action end-to-end** — tc7 · Workstream #3 · GE Vernova Observability POC · subtasks 0/5 · labels: ai, runbook, tc · updated
  Pass: full chain documented — trigger → action → outcome. Runbook actions agreed in pre-kickoff SRE session.
- **Pre-kickoff session: SRE team — validate AI & agentic test criteria** — Pending · Workstream #3 · GE Vernova Observability POC · subtasks 0/6 · labels: ai-workflows, alignment · updated
  Session with GEV SRE team to validate and agree test cases in §7 before the POC starts. Must resolve: RCA incident scenario, runbook actions definition, anomaly detection signals, and what 'Nightshift' means.
- **TC7.4 — Anomaly detection jobs on agreed signals** — tc7 · Workstream #3 · GE Vernova Observability POC · subtasks 0/4 · labels: ai, anomaly-detection, tc · updated
  Pass: SRE team confirms anomalies surfaced are meaningful and noise level is acceptable. Run on loaded/synthetic data.
- **Pre-kickoff session: App team — validate LLM-as-judge criteria** — Pending · Workstream #2 · GE Vernova Observability POC · subtasks 0/3 · labels: ai-workflows, alignment · updated
  Session with GEV app team to define TC7.5 (LLM-as-judge workflow). Must agree: which LLM apps are in scope, what is being judged, what criteria, where eval results land.
- **TC7.5 — LLM-as-judge: GenAI telemetry captured and eval scores dashboarded** — tc7 · Workstream #3 · GE Vernova Observability POC · subtasks 0/5 · labels: ai, llm-as-judge, tc · updated
  Pass: app team validates the workflow shape. Criteria set in pre-kickoff app-team session — placeholder until then.
- **YAML block > Shoeb for OTEL configuration** — Pending · GE Vernova Observability POC · due Aug 10 · overdue, due this week, updated
- **TC1.1 — Load agreed sources, measure metered ingest** — Pending · GE Vernova Observability POC · subtasks 0/5 · labels: cost-sizing, tc · updated
  Load 1–2 agreed sources for a defined window (12–24 hrs). Metered GB must be within ±10% of the pre-load estimate.
- **TC2.3 — OTel traces & Metrics flowing via native OTLP endpoint** — Pending · GE Vernova Observability POC · subtasks 0/4 · labels: apm, otel, tc · updated
  Pass: traces render in APM UI (service map, latency, errors) alongside OTel metrics.
- **Run new discovery on Splunk Observability** — Finished · GE Vernova Observability POC · due Aug 12 · due this week, new
- **Circulate success criteria doc for markup and agreement before kickoff** — Backlog · GE Vernova Observability POC · subtasks 0/4 · labels: governance · updated
  AI-structured doc from call notes circulated to GEV for markup. Every TC gets a named customer sign-off owner — that's what turns 'warm and fuzzy' into a checkbox.
- **Identify and schedule Splunk Observability ?-displacement reference call** — Backlog · GE Vernova Observability POC · subtasks 0/2 · labels: governance, reference · updated
  Pair the POC with a reference call from a Splunk-to-Elastic customer. Assess whether Pepsi is still viable or go with Vanguard.
- **Create an SPL query to profile their data set for replication** — Finished · GE Vernova Observability POC · start Aug 6 · due Aug 7 · updated
  develop SPL
- **Setup 9.4 & ESQL workshops for GE staff** — Finished · GE Vernova Observability POC · due Aug 10 · due this week, updated
- **DSR for Trial Expansion** — Finished · GE Vernova Observability POC · due Aug 10 · due this week, updated
- **write a script to take an inventory of Splunk Observability Cloud** — Finished · GE Vernova Observability POC · due Aug 11 · due this week, new
- **Run DIMA + Data Inventory query from license server** — Finished · GE Vernova Observability POC · subtasks 0/3 · labels: data-inventory, dima · updated
  Run the license manager query to inventory GEV's data estate. Enables synthetic data generation, identifies unused assets, shows how heavily each source is used, and gives Elastic the input needed to estimate conversion effort and services scope.
  
  Query:
  ```
  earliest=-30d@d index=_* source="*license*" | bucket _time span=1d | eval gb=round(b/1024/1024/1024,2) | stats sum(gb) by _time, st, i
  ```
- **Smoke test routing OTEL data to mOTEL endpoint** — Finished · GE Vernova Observability POC · labels: ingest, otel · updated
  Verify OTel data routes correctly to the managed OTel (mOTEL) endpoint before the POC kicks off.
- **Confirm trial account connectivity & IP exceptions** — Finished · GE Vernova Observability POC · subtasks 0/2 · labels: logistics, network · updated
  GE Vernova connects via private link (confirmed). Elastic employee IP exceptions still pending.
- **Request trial account POC funding** — Finished · GE Vernova Observability POC · subtasks 0/2 · labels: logistics · updated
  Submit the POC funding form via Brad (Elastic). GEV has already sent their Org ID and email.
- **Setup a Slack channel for POC collaboration** — Finished · GE Vernova Observability POC · subtasks 0/1 · labels: logistics · updated
- **Box folder collaboration set up** — Finished · GE Vernova Observability POC · labels: logistics · updated
  Shared Box folder between GEV and Elastic for POC artefacts.
- **GE Vernova create serverless trial account** — Finished · GE Vernova Observability POC · labels: logistics · updated
  GEV provisioned their Elastic serverless trial account.
- **TC3.1 — DIMA inventory rendered from GEV's JSON** — Finished · GE Vernova Observability POC · subtasks 2/2 · labels: migration, tc · updated
  Pass: GEV confirms the rendered inventory is complete and accurate.
- **Lambda > Elastic** — Finished · GE Vernova Observability POC · due Aug 12 · due this week, new

## Mon, Aug 10, 2026

### Commits
- `be76ed3` commit (katelawrencegupta-elastic) · Aug 10

## Tue, Aug 11, 2026

### Card updates
- Moved "Test deploying heavy forwarders to dual-feed logs from Splunk" Finished → Archive
- Moved "TC5.2 — Common SPL searches converted to ES|QL, results validated" tc5 → Archive
- Moved "TC2.3 — OTel traces & Metrics flowing via native OTLP endpoint" tc2 → Pending
- Moved "Determine data source subset to move over and continuous loading plan" Pending → Archive
- Removed subtask on "TC3.2 — Convert two priority dashboards": Identify any SPL macros/lookups those dashboards depend on
- Changed POC link on "Run new discovery on Splunk Observability"
- Renamed "Identify and schedule Splunk-displacement reference call" → "Identify and schedule Splunk Observability ?-displacement reference call"
- Moved "Pre-kickoff session: SRE team — validate AI & agentic test criteria" Misc → Workstream #3
- Moved "Pre-kickoff session: App team — validate LLM-as-judge criteria" Misc → Workstream #2
- Moved "TC3.2 — Convert two priority dashboards" Misc → Workstream #2
- Moved "TC3.2 — Convert two priority dashboards" Workstream #2 → Workstream #1
- Moved "TC3.3 — Convert sample alerts and fire on test conditions" Misc → Workstream #1
- Moved "TC3.4 — Deliver full-inventory classification" Misc → Workstream #1
- Moved "TC4.1 — FinOps cloud-cost + LLM-cost dashboards on synthetic data" Misc → Workstream #2
- Moved "TC4.2 — Alert rules trigger and route at synthetic volume" Misc → Workstream #2
- Moved "TC5.1 — Named users complete daily workflows unassisted" Misc → Workstream #1
- Moved "TC6.1 — Dashboard query response meets agreed threshold" Misc → Workstream #1
- Moved "TC6.2 — Ingest sustains test-window rate with no lag or backlog" Misc → Workstream #1
- Moved "Pre-kickoff session: App team — validate LLM-as-judge criteria" Workstream #2 → Workstream #1
- Moved "Pre-kickoff session: App team — validate LLM-as-judge criteria" Workstream #1 → Workstream #3
- Moved "Pre-kickoff session: App team — validate LLM-as-judge criteria" Workstream #3 → Workstream #2
- Moved "TC7.1 — Gen AI Assistant: create chart and alert rule via natural language" Misc → Workstream #3
- Moved "TC7.2 — RCA workflow via Agent Builder on correlated data" Misc → Workstream #3
- Moved "TC7.3 — Runbook automation: alert → runbook action end-to-end" Misc → Workstream #3
- Moved "TC7.4 — Anomaly detection jobs on agreed signals" Misc → Workstream #3
- Moved "TC7.5 — LLM-as-judge: GenAI telemetry captured and eval scores dashboarded" Misc → Workstream #3

## Wed, Aug 12, 2026

### Card updates
- Created "Lambda > Elastic" in To Do
- Moved "Lambda > Elastic" To Do → Finished

### Commits
- `4559933` commit (katelawrencegupta-elastic) · Aug 12

## Current board

36 active · 6 archived

### Backlog (2)
- **Circulate success criteria doc for markup and agreement before kickoff** — Misc · subtasks 0/4 · governance
  AI-structured doc from call notes circulated to GEV for markup. Every TC gets a named customer sign-off owner — that's what turns 'warm and fuzzy' into a checkbox.
- **Identify and schedule Splunk Observability ?-displacement reference call** — Misc · subtasks 0/2 · governance, reference
  Pair the POC with a reference call from a Splunk-to-Elastic customer. Assess whether Pepsi is still viable or go with Vanguard.

### Pending (5)
- **Pre-kickoff session: SRE team — validate AI & agentic test criteria** — Workstream #3 · subtasks 0/6 · ai-workflows, alignment
  Session with GEV SRE team to validate and agree test cases in §7 before the POC starts. Must resolve: RCA incident scenario, runbook actions definition, anomaly detection signals, and what 'Nightshift' means.
- **Pre-kickoff session: App team — validate LLM-as-judge criteria** — Workstream #2 · subtasks 0/3 · ai-workflows, alignment
  Session with GEV app team to define TC7.5 (LLM-as-judge workflow). Must agree: which LLM apps are in scope, what is being judged, what criteria, where eval results land.
- **YAML block > Shoeb for OTEL configuration** — Misc · due Aug 10 · overdue
- **TC1.1 — Load agreed sources, measure metered ingest** — Misc · subtasks 0/5 · cost-sizing, tc
  Load 1–2 agreed sources for a defined window (12–24 hrs). Metered GB must be within ±10% of the pre-load estimate.
- **TC2.3 — OTel traces & Metrics flowing via native OTLP endpoint** — Misc · subtasks 0/4 · apm, otel, tc
  Pass: traces render in APM UI (service map, latency, errors) alongside OTel metrics.

### Finished (14)
- **Run new discovery on Splunk Observability** — Misc · due Aug 12 · overdue
- **Create an SPL query to profile their data set for replication** — Misc · due Aug 7 · overdue
  develop SPL
- **Setup 9.4 & ESQL workshops for GE staff** — Misc · due Aug 10 · overdue
- **DSR for Trial Expansion** — Misc · due Aug 10 · overdue
- **write a script to take an inventory of Splunk Observability Cloud** — Misc · due Aug 11 · overdue
- **Run DIMA + Data Inventory query from license server** — Misc · subtasks 0/3 · data-inventory, dima
  Run the license manager query to inventory GEV's data estate. Enables synthetic data generation, identifies unused assets, shows how heavily each source is used, and gives Elastic the input needed to estimate conversion effort and services scope.
  
  Query:
  ```
  earliest=-30d@d index=_* source="*license*" | bucket _time span=1d | eval gb=round(b/1024/1024/1024,2) | stats sum(gb) by _time, st, i
  ```
- **Smoke test routing OTEL data to mOTEL endpoint** — Misc · ingest, otel
  Verify OTel data routes correctly to the managed OTel (mOTEL) endpoint before the POC kicks off.
- **Confirm trial account connectivity & IP exceptions** — Misc · subtasks 0/2 · logistics, network
  GE Vernova connects via private link (confirmed). Elastic employee IP exceptions still pending.
- **Request trial account POC funding** — Misc · subtasks 0/2 · logistics
  Submit the POC funding form via Brad (Elastic). GEV has already sent their Org ID and email.
- **Setup a Slack channel for POC collaboration** — Misc · subtasks 0/1 · logistics
- **Box folder collaboration set up** — Misc · logistics
  Shared Box folder between GEV and Elastic for POC artefacts.
- **GE Vernova create serverless trial account** — Misc · logistics
  GEV provisioned their Elastic serverless trial account.
- **TC3.1 — DIMA inventory rendered from GEV's JSON** — Misc · subtasks 2/2 · migration, tc
  Pass: GEV confirms the rendered inventory is complete and accurate.
- **Lambda > Elastic** — Misc · due Aug 12 · overdue

### tc1 (2)
- **TC1.2 — Extrapolation model review & FinOps sign-off** — Misc · subtasks 0/4 · cost-sizing, tc
  Walk GEV FinOps owner through the extrapolation model (partial window → daily → monthly). Pass: projection ≤ RFP sizing, or variance explained and accepted.
- **TC1.3 — Serverless metering demonstration** — Misc · subtasks 0/2 · cost-sizing, tc
  Demonstrate how serverless metering works (billed on enriched, uncompressed bytes at the front door — raw Splunk GB ≠ billed GB). Pass: GEV can articulate what a billed GB is. Eliminates the 'anomaly' fear.

### tc3 (3)
- **TC3.2 — Convert two priority dashboards** — Workstream #1 · subtasks 0/3 · dashboards, migration, tc
  Pass: dashboard owner confirms functional parity (not pixel parity — set expectation explicitly).
- **TC3.3 — Convert sample alerts and fire on test conditions** — Workstream #1 · subtasks 0/3 · alerts, migration, tc
  Pass: correct trigger + notification routing for converted alerts.
- **TC3.4 — Deliver full-inventory classification** — Workstream #1 · subtasks 0/3 · migration, tc
  Pass: GEV agrees that residual (blocker / needs work) = services scope. Explicit classification: converts clean / needs work / blocker.

### tc4 (2)
- **TC4.1 — FinOps cloud-cost + LLM-cost dashboards on synthetic data** — Workstream #2 · subtasks 0/4 · dashboards, finops, tc
  FinOps is GEV's hot button. Build and demo cloud-cost + LLM-cost dashboards on synthetic data — timeline doesn't hinge on ingest.
- **TC4.2 — Alert rules trigger and route at synthetic volume** — Workstream #2 · subtasks 0/3 · alerts, tc
  Pass: alert rules fire and route correctly under synthetic load.

### tc5 (1)
- **TC5.1 — Named users complete daily workflows unassisted** — Workstream #1 · subtasks 0/3 · tc, usability
  GEV's named users should be able to complete their daily workflows unassisted in the Elastic sandbox. POC duration is 'long enough'.

### tc6 (2)
- **TC6.1 — Dashboard query response meets agreed threshold** — Workstream #1 · subtasks 0/4 · performance, tc
  Pass: dashboard queries respond within the threshold GEV names. Get them to commit to a number — don't let this stay vague.
- **TC6.2 — Ingest sustains test-window rate with no lag or backlog** — Workstream #1 · subtasks 0/2 · ingest, performance, tc
  Pass: ingest pipeline holds the test-window rate with no measurable lag or backlog.

### tc7 (5)
- **TC7.1 — Gen AI Assistant: create chart and alert rule via natural language** — Workstream #3 · subtasks 0/4 · ai, assistant, tc
  SRE user creates a visualization and an alert rule using natural-language prompts in the AI Assistant. Pass: both work without manual query writing.
- **TC7.2 — RCA workflow via Agent Builder on correlated data** — Workstream #3 · subtasks 0/5 · agent-builder, ai, rca, tc
  Agent built with AI Assistant, run against a staged incident. Requires TC2.4 (log↔trace correlation). Pass: agent surfaces root cause with supporting evidence across logs/traces/metrics.
- **TC7.3 — Runbook automation: alert → runbook action end-to-end** — Workstream #3 · subtasks 0/5 · ai, runbook, tc
  Pass: full chain documented — trigger → action → outcome. Runbook actions agreed in pre-kickoff SRE session.
- **TC7.4 — Anomaly detection jobs on agreed signals** — Workstream #3 · subtasks 0/4 · ai, anomaly-detection, tc
  Pass: SRE team confirms anomalies surfaced are meaningful and noise level is acceptable. Run on loaded/synthetic data.
- **TC7.5 — LLM-as-judge: GenAI telemetry captured and eval scores dashboarded** — Workstream #3 · subtasks 0/5 · ai, llm-as-judge, tc
  Pass: app team validates the workflow shape. Criteria set in pre-kickoff app-team session — placeholder until then.
