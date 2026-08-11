/**
 * Load Google OAuth client credentials + stored user tokens from server/auth/.
 * Tokens file is created by: node server/scripts/google-oauth-login.js
 */
const fs = require("fs");
const path = require("path");

const AUTH_DIR = path.join(__dirname, "..", "auth");
const TOKEN_PATH = path.join(AUTH_DIR, "token.json");
const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
];
const REDIRECT_URI = "http://127.0.0.1:8765/oauth2callback";

function findClientSecretPath() {
  if (!fs.existsSync(AUTH_DIR)) return null;
  const files = fs.readdirSync(AUTH_DIR).filter(
    (f) => f.startsWith("client_secret_") && f.endsWith(".json")
  );
  if (files.length) return path.join(AUTH_DIR, files[0]);
  const alt = path.join(AUTH_DIR, "credentials.json");
  return fs.existsSync(alt) ? alt : null;
}

function loadClient() {
  const credPath = findClientSecretPath();
  if (!credPath) return null;
  const raw = JSON.parse(fs.readFileSync(credPath, "utf8"));
  const c = raw.installed || raw.web || raw;
  if (!c.client_id || !c.client_secret) return null;
  return {
    client_id: c.client_id,
    client_secret: c.client_secret,
    token_uri: c.token_uri || "https://oauth2.googleapis.com/token",
    auth_uri: c.auth_uri || "https://accounts.google.com/o/oauth2/v2/auth",
    redirect_uri: (c.redirect_uris && c.redirect_uris[0]) || REDIRECT_URI,
    path: credPath,
  };
}

function loadTokens() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  const prev = loadTokens() || {};
  const next = {
    ...prev,
    ...tokens,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(next, null, 2) + "\n");
  return next;
}

function authUrl(client) {
  const params = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: client.redirect_uri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${client.auth_uri}?${params}`;
}

async function exchangeCode(client, code) {
  const res = await fetch(client.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: client.redirect_uri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`code exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token || loadTokens()?.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000 - 60_000,
    scope: data.scope,
    token_type: data.token_type,
  });
}

async function refreshAccessToken(client, refreshToken) {
  const res = await fetch(client.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const saved = saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000 - 60_000,
    scope: data.scope,
    token_type: data.token_type,
  });
  return saved.access_token;
}

/**
 * Resolve a usable access token from env, token.json, or service account.
 */
async function getAccessToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;

  const client = loadClient();
  const tokens = loadTokens();
  if (client && tokens?.access_token) {
    if (tokens.expires_at && Date.now() < tokens.expires_at) {
      return tokens.access_token;
    }
    if (tokens.refresh_token) {
      return refreshAccessToken(client, tokens.refresh_token);
    }
    return tokens.access_token;
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath || !fs.existsSync(credPath)) return null;

  const crypto = require("crypto");
  const creds = JSON.parse(fs.readFileSync(credPath, "utf8"));
  if (!creds.client_email || !creds.private_key) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: creds.client_email,
      scope: SCOPES.join(" "),
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(unsigned), creds.private_key).toString("base64url");
  const assertion = `${unsigned}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

module.exports = {
  AUTH_DIR,
  TOKEN_PATH,
  REDIRECT_URI,
  SCOPES,
  loadClient,
  loadTokens,
  saveTokens,
  authUrl,
  exchangeCode,
  getAccessToken,
};
