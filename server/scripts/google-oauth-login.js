#!/usr/bin/env node
/**
 * One-time browser OAuth login. Saves refresh/access tokens to server/auth/token.json.
 *
 * Before running, in Google Cloud Console → APIs & Services → Credentials →
 * this OAuth client → Authorized redirect URIs, add exactly:
 *   http://127.0.0.1:8765/oauth2callback
 *
 * Then:
 *   node server/scripts/google-oauth-login.js
 */
const http = require("http");
const { exec } = require("child_process");
const {
  loadClient,
  authUrl,
  exchangeCode,
  TOKEN_PATH,
  REDIRECT_URI,
} = require("./google-auth");

async function main() {
  const client = loadClient();
  if (!client) {
    console.error("No client_secret_*.json found in server/auth/");
    process.exit(1);
  }

  // Prefer our loopback URI (Web clients must register it in the Console).
  client.redirect_uri = REDIRECT_URI;

  const url = authUrl(client);
  console.log("Open this URL if the browser does not open automatically:\n");
  console.log(url);
  console.log(`\nWaiting for redirect to ${REDIRECT_URI} …`);
  console.log(
    "\nIf you see redirect_uri_mismatch, add this exact URI to the OAuth client in Google Cloud Console:\n ",
    REDIRECT_URI
  );

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, REDIRECT_URI);
        if (u.pathname !== "/oauth2callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const err = u.searchParams.get("error");
        if (err) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>Auth failed</h1><pre>${err}</pre>`);
          server.close();
          reject(new Error(err));
          return;
        }
        const authCode = u.searchParams.get("code");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Signed in</h1><p>You can close this tab and return to the terminal.</p>");
        server.close();
        resolve(authCode);
      } catch (e) {
        reject(e);
      }
    });
    server.listen(8765, "127.0.0.1", () => {
      const openCmd =
        process.platform === "darwin"
          ? `open "${url}"`
          : process.platform === "win32"
            ? `start "" "${url}"`
            : `xdg-open "${url}"`;
      exec(openCmd, () => {});
    });
    server.on("error", reject);
  });

  if (!code) {
    console.error("No authorization code received.");
    process.exit(1);
  }

  const tokens = await exchangeCode(client, code);
  console.log(`Saved tokens to ${TOKEN_PATH}`);
  console.log(tokens.refresh_token ? "Refresh token: yes" : "Refresh token: missing (re-run with prompt=consent)");
  console.log("Next: node server/scripts/sync-poc-gdoc.js");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
