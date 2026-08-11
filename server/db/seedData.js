// Seed accounts — ported from the existing fieldwork app's DEFAULT_ACCOUNTS
// (fieldwork/0.1.0/client/src/App.jsx), which itself was synced from the
// account-exec Google Sheet. Kept here as the source of truth until fielder
// grows its own "sync accounts from sheet" flow.
const ACCOUNTS = [
  // Corey Fallarino
  { key: "travelers", label: "Travelers", long: "The Travelers Indemnity Co", ae: "Corey Fallarino", bg: "#0b2e22", color: "#3dcfa0", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "foa", label: "FoA", long: "Finance of America", ae: "Corey Fallarino", bg: "#0d2e1a", color: "#4dc87a", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "dtcc", label: "DTCC", long: "DTCC", ae: "Corey Fallarino", bg: "#2e1f08", color: "#e8a44a", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "gs", label: "Goldman Sachs", long: "Goldman Sachs", ae: "Corey Fallarino", bg: "#1e1e18", color: "#c8c090", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "insuramatch", label: "InsuraMatch", long: "InsuraMatch LLC", ae: "Corey Fallarino", bg: "#1a2818", color: "#5dc890", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "moodys", label: "Moody's", long: "Moody's Analytics", ae: "Corey Fallarino", bg: "#28200a", color: "#d8a840", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "blackstone", label: "Blackstone", long: "Blackstone", ae: "Corey Fallarino", bg: "#201820", color: "#b880d0", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "precisely", label: "Precisely", long: "Precisely", ae: "Corey Fallarino", bg: "#0a2030", color: "#60a8e0", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "trov", label: "Trov", long: "Trov", ae: "Corey Fallarino", bg: "#201a10", color: "#c89860", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "tiaa", label: "TIAA", long: "TIAA", ae: "Corey Fallarino", bg: "#102020", color: "#50b8b8", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  { key: "regulatory_data", label: "Reg. Data Corp", long: "Regulatory Data Corporation", ae: "Corey Fallarino", bg: "#201020", color: "#c870a0", aeBg: "#1a2e1a", aeColor: "#7acf9a" },
  // Peter Antoinette
  { key: "merck", label: "Merck", long: "Merck & Co., Inc.", ae: "Peter Antoinette", bg: "#1a1040", color: "#9080f0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "jj", label: "J&J", long: "Johnson & Johnson", ae: "Peter Antoinette", bg: "#28103a", color: "#c87ae0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "regeneron", label: "Regeneron", long: "Regeneron", ae: "Peter Antoinette", bg: "#201030", color: "#b070d0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "abbvie", label: "AbbVie", long: "AbbVie", ae: "Peter Antoinette", bg: "#1a0a38", color: "#a860e8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "gsx", label: "GSX", long: "GSX", ae: "Peter Antoinette", bg: "#300a30", color: "#e070c0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "pfizer", label: "Pfizer", long: "Pfizer", ae: "Peter Antoinette", bg: "#0a2040", color: "#6090e0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "gsk", label: "GSK", long: "GlaxoSmithKline", ae: "Peter Antoinette", bg: "#0c2438", color: "#4fa8d8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "bms", label: "BMS", long: "Bristol Myers Squibb", ae: "Peter Antoinette", bg: "#241030", color: "#a865d0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "roche", label: "Roche", long: "Roche / Genentech", ae: "Peter Antoinette", bg: "#1c1030", color: "#8f6fe0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "emd_serono", label: "EMD Serono", long: "EMD Serono (Merck KGaA)", ae: "Peter Antoinette", bg: "#301028", color: "#d070b0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "ath", label: "ATH", long: "ATH", ae: "Peter Antoinette", bg: "#241820", color: "#c090a8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "lexent_bio", label: "Lexent Bio", long: "Lexent Bio", ae: "Peter Antoinette", bg: "#182030", color: "#7098c8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  // Timothy Webster
  { key: "ge_healthcare", label: "GE Healthcare", long: "GE Healthcare", ae: "Timothy Webster (Tim)", bg: "#2a1800", color: "#e09040", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "ge_vernova", label: "GE Vernova", long: "GE Vernova", ae: "Timothy Webster (Tim)", bg: "#281400", color: "#d07830", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "ge_aerospace", label: "GE Aerospace", long: "GE Aerospace", ae: "Timothy Webster (Tim)", bg: "#301a00", color: "#e8a050", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "bloomberg", label: "Bloomberg", long: "Bloomberg Finance L.P.", ae: "Timothy Webster (Tim)", bg: "#201408", color: "#c88840", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "hilton", label: "Hilton", long: "Hilton Grand Vacations", ae: "Timothy Webster (Tim)", bg: "#281810", color: "#d09050", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "workforce", label: "WorkForce", long: "WorkForce Software", ae: "Timothy Webster (Tim)", bg: "#201000", color: "#b87020", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "adp", label: "ADP", long: "ADP", ae: "Timothy Webster (Tim)", bg: "#301808", color: "#e08838", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "colgate", label: "Colgate", long: "Colgate-Palmolive", ae: "Timothy Webster (Tim)", bg: "#280800", color: "#e07020", aeBg: "#2a2218", aeColor: "#dfb87a" },
  // Internal / catch-all
  { key: "other", label: "Other", long: "Other", ae: null, bg: "#1a1e28", color: "#6a7a96", aeBg: null, aeColor: null },
  // Real accounts found in the migrated task history that were never in the
  // hardcoded/sheet-synced account lists at all (not a key-mismatch — these
  // simply had no account row anywhere) — filed under "other" until the
  // migration. No AE could be determined from the task text; assign one and
  // adjust colors as needed.
  { key: "milliporesigma", label: "MilliporeSigma", long: "MilliporeSigma", ae: "Peter Antoinette", bg: "#1a2430", color: "#6fa8c8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "marriott", label: "Marriott", long: "Marriott International", ae: null, bg: "#241c14", color: "#c8a068", aeBg: null, aeColor: null },
];

const STAGES = [
  { key: "backlog", label: "Backlog", order: 0 },
  { key: "in_progress", label: "To Do", order: 1 },
  { key: "blocked", label: "Blocked", order: 2 },
  { key: "done", label: "Finished", order: 3 },
  { key: "archive", label: "Archive", order: 4 },
];

module.exports = { ACCOUNTS, STAGES };
