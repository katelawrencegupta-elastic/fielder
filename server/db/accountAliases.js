// fieldwork's account list has drifted over time between a hand-curated set of
// short keys (baked into its client, e.g. "jj") and a separate Google-Sheet-synced
// cache that auto-slugifies company names (e.g. "johnson_johnson"). Tasks/accounts
// tagged with the sheet-style key need to resolve to the same short key fielder
// uses, or they'd silently end up under "other" / as duplicate accounts.
const ACCOUNT_KEY_ALIASES = {
  johnson_johnson: "jj",
  insuramatch_llc: "insuramatch",
  moodys_analytics_inc: "moodys",
  regulatory_data_corp: "regulatory_data",
  merck_co_inc: "merck",
  bloomberg_finance_lp: "bloomberg",
  hilton_grand_vacatio: "hilton",
  workforce_software: "workforce",
  colgatepalmolive: "colgate",
};

function normalizeAccountKey(key) {
  return ACCOUNT_KEY_ALIASES[key] || key;
}

module.exports = { ACCOUNT_KEY_ALIASES, normalizeAccountKey };
