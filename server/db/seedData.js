// Seed accounts — kept in sync with the KLG account CSV / Google Sheet.
// Live sync: POST /api/accounts/sync (reads "KLG Account list - current.csv").
const ACCOUNTS = [
  // Ian Santee
  {
    key: "travelers",
    label: "Travelers",
    long: "The Travelers Indemnity Company",
    ae: "Ian Santee",
    bg: "#0b2e22",
    color: "#3dcfa0",
    aeBg: "#1a2a3a",
    aeColor: "#7ab8e8",
  },
  // Stefan Hull
  {
    key: "blackstone",
    label: "Blackstone",
    long: "BlackStone",
    ae: "Stefan Hull",
    bg: "#201820",
    color: "#b880d0",
    aeBg: "#2a1818",
    aeColor: "#e87a7a",
  },
  // Timothy Webster (includes former Corey book now on Tim)
  { key: "gs", label: "Goldman Sachs", long: "Goldman Sachs", ae: "Timothy Webster (Tim)", bg: "#1e1e18", color: "#c8c090", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "tiaa", label: "TIAA", long: "TIAA", ae: "Timothy Webster (Tim)", bg: "#102020", color: "#50b8b8", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "dtcc", label: "DTCC", long: "The Depository Trust & Clearing Corporation", ae: "Timothy Webster (Tim)", bg: "#2e1f08", color: "#e8a44a", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "foa", label: "FoA", long: "Finance of America Holdings LLC", ae: "Timothy Webster (Tim)", bg: "#0d2e1a", color: "#4dc87a", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "ge_healthcare", label: "GE Healthcare", long: "GE Healthcare", ae: "Timothy Webster (Tim)", bg: "#2a1800", color: "#e09040", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "ge_vernova", label: "GE Vernova", long: "GE Vernova", ae: "Timothy Webster (Tim)", bg: "#281400", color: "#d07830", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "ge_aerospace", label: "GE Aerospace", long: "GE Aerospace", ae: "Timothy Webster (Tim)", bg: "#301a00", color: "#e8a050", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "bloomberg", label: "Bloomberg", long: "Bloomberg Finance L.P.", ae: "Timothy Webster (Tim)", bg: "#201408", color: "#c88840", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "hilton", label: "Hilton", long: "Hilton Grand Vacations Company", ae: "Timothy Webster (Tim)", bg: "#281810", color: "#d09050", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "workforce", label: "WorkForce", long: "WorkForce Software", ae: "Timothy Webster (Tim)", bg: "#201000", color: "#b87020", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "adp", label: "ADP", long: "ADP", ae: "Timothy Webster (Tim)", bg: "#301808", color: "#e08838", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "colgate", label: "Colgate", long: "Colgate-Palmolive", ae: "Timothy Webster (Tim)", bg: "#280800", color: "#e07020", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "marriott", label: "Marriott", long: "Marriott", ae: "Timothy Webster (Tim)", bg: "#241c14", color: "#c8a068", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "cmp_i_owner_t", label: "Cmp I Owner-T, LLC", long: "Cmp I Owner-T, LLC", ae: "Timothy Webster (Tim)", bg: "#0d2a45", color: "#5db8f5", aeBg: "#2a2218", aeColor: "#dfb87a" },
  // Peter Antoinette
  { key: "merck", label: "Merck", long: "Merck & Co., Inc.", ae: "Peter Antoinette", bg: "#1a1040", color: "#9080f0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "jj", label: "J&J", long: "Johnson & Johnson", ae: "Peter Antoinette", bg: "#28103a", color: "#c87ae0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "regeneron", label: "Regeneron", long: "Regeneron", ae: "Peter Antoinette", bg: "#201030", color: "#b070d0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "abbvie", label: "AbbVie", long: "AbbVie", ae: "Peter Antoinette", bg: "#1a0a38", color: "#a860e8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "gsx", label: "GSX", long: "GSX", ae: "Peter Antoinette", bg: "#300a30", color: "#e070c0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "pfizer", label: "Pfizer", long: "Pfizer", ae: "Peter Antoinette", bg: "#0a2040", color: "#6090e0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "gsk", label: "GSK", long: "GlaxoSmithKline", ae: "Peter Antoinette", bg: "#0c2438", color: "#4fa8d8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "bms", label: "BMS", long: "Bristol Myers Squibb", ae: "Peter Antoinette", bg: "#241030", color: "#a865d0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "roche", label: "Roche", long: "Roche USA", ae: "Peter Antoinette", bg: "#1c1030", color: "#8f6fe0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "emd_serono", label: "EMD Serono", long: "EMD Serono", ae: "Peter Antoinette", bg: "#301028", color: "#d070b0", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "ath", label: "ATH", long: "ATH", ae: "Peter Antoinette", bg: "#241820", color: "#c090a8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "lexent_bio", label: "Lexent Bio", long: "Lexent Bio", ae: "Peter Antoinette", bg: "#182030", color: "#7098c8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  { key: "milliporesigma", label: "MilliporeSigma", long: "MilliporeSigma", ae: "Peter Antoinette", bg: "#1a2430", color: "#6fa8c8", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  // Internal 1:1 meeting folders
  { key: "1-1-with-tim", label: "tim-1:1", long: "tim-1:1", ae: "Timothy Webster (Tim)", bg: "#2a2218", color: "#dfb87a", aeBg: "#2a2218", aeColor: "#dfb87a" },
  { key: "corey-s-pod", label: "corey-1:1", long: "corey-1:1", ae: null, bg: "#1a2e1a", color: "#7acf9a", aeBg: null, aeColor: null },
  { key: "iko-1-1", label: "Iko-1:1", long: "Iko-1:1", ae: null, bg: "#1a2430", color: "#6fa8c8", aeBg: null, aeColor: null },
  { key: "pete-1-1", label: "pete-1:1", long: "pete-1:1", ae: "Peter Antoinette", bg: "#2a1a2e", color: "#c87adf", aeBg: "#2a1a2e", aeColor: "#c87adf" },
  // Catch-all
  { key: "other", label: "Other", long: "Other", ae: null, bg: "#1a1e28", color: "#6a7a96", aeBg: null, aeColor: null },
];

const STAGES = [
  { key: "backlog", label: "Backlog", order: 0 },
  { key: "in_progress", label: "To Do", order: 1 },
  { key: "blocked", label: "Blocked", order: 2 },
  { key: "done", label: "Finished", order: 3 },
  { key: "archive", label: "Archive", order: 4 },
];

module.exports = { ACCOUNTS, STAGES };
