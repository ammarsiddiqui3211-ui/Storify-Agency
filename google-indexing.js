#!/usr/bin/env node

/**
 * Storify Agency - Google Instant Indexing Tool
 * -------------------------------------------------------------
 * Uses Google's Web Search Indexing API to submit website URLs
 * for rapid crawling and re-indexing.
 *
 * Requirements:
 * - Node.js v18+ (uses built-in crypto and native fetch, zero npm dependencies)
 * - Google Cloud Service Account JSON key (auto-detected in root folder)
 * - Service account email added as an Owner in Google Search Console
 *
 * Usage:
 *   node google-indexing.js                 # Submit all URLs from sitemap.xml
 *   node google-indexing.js --check         # Check indexing metadata status of all URLs
 *   node google-indexing.js <url>           # Submit a specific URL
 *   node google-indexing.js --check <url>   # Check status of a specific URL
 *   node google-indexing.js --delete <url>  # Notify Google that a URL was deleted
 *   node google-indexing.js --help          # Show help and instructions
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Terminal colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

const SCOPES = [
  'https://www.googleapis.com/auth/indexing',
  'https://www.googleapis.com/auth/webmasters'
].join(' ');

// Locate credentials JSON file
function findCredentialsFile() {
  const customPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (customPath && fs.existsSync(customPath)) {
    return path.resolve(customPath);
  }

  const files = fs.readdirSync(process.cwd());
  const found = files.find(file => file.startsWith('gen-lang-client-') && file.endsWith('.json')) ||
                files.find(file => file.endsWith('-credentials.json') || file === 'service-account.json');

  if (found) {
    return path.resolve(process.cwd(), found);
  }
  return null;
}

// Convert string / object to base64url
function base64url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(JSON.stringify(input), 'utf8');
  return buf.toString('base64url');
}

// Generate Google OAuth2 Access Token using RS256 JWT
async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const claimSet = base64url({
    iss: credentials.client_email,
    scope: SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  });

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${claimSet}`);
  const signature = sign.sign(credentials.private_key, 'base64url');
  const jwt = `${header}.${claimSet}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OAuth token request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Extract URLs from local sitemap.xml
function extractSitemapUrls(sitemapPath) {
  if (!fs.existsSync(sitemapPath)) {
    throw new Error(`Sitemap file not found at: ${sitemapPath}`);
  }
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
  const urls = [];
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    // Exclude the sitemap itself from the list of indexable pages
    if (!url.endsWith('.xml')) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

// Publish URL update or deletion to Google Indexing API
async function publishUrlNotification(token, url, type = 'URL_UPDATED') {
  const endpoint = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      type
    })
  });

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// Check URL metadata status from Google Indexing API
async function getUrlMetadata(token, url) {
  const endpoint = `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// Sleep helper for throttling
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Print instructions for GSC ownership verification
function printOwnershipInstructions(clientEmail) {
  console.log(`\n${colors.yellow}${colors.bold}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.yellow}${colors.bold}⚠️  GOOGLE SEARCH CONSOLE OWNERSHIP REQUIRED${colors.reset}`);
  console.log(`${colors.yellow}${colors.bold}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`Google requires your Service Account to be an ${colors.bold}Owner${colors.reset} of your domain in Google Search Console.\n`);
  console.log(`1. Open ${colors.cyan}https://search.google.com/search-console/${colors.reset}`);
  console.log(`2. Select your property: ${colors.bold}agency.storifyco.com${colors.reset} (or domain property ${colors.bold}storifyco.com${colors.reset})`);
  console.log(`3. Go to ${colors.bold}Settings${colors.reset} (bottom of left sidebar) > ${colors.bold}Users and permissions${colors.reset}`);
  console.log(`4. Click ${colors.bold}Add user${colors.reset}`);
  console.log(`5. Paste this Service Account Email:`);
  console.log(`   ${colors.green}${colors.bold}${clientEmail}${colors.reset}`);
  console.log(`6. Set Permission level to: ${colors.green}${colors.bold}Owner${colors.reset}`);
  console.log(`7. Click ${colors.bold}Add${colors.reset}, then re-run this script!\n`);
  console.log(`${colors.yellow}${colors.bold}─────────────────────────────────────────────────────────────────────────────${colors.reset}\n`);
}

function printHelp() {
  console.log(`
${colors.cyan}${colors.bold}Storify Agency - Google Instant Indexing Tool${colors.reset}

${colors.bold}Usage:${colors.reset}
  node google-indexing.js [options] [url]

${colors.bold}Commands & Options:${colors.reset}
  ${colors.green}node google-indexing.js${colors.reset}
      Submit all URLs from sitemap.xml to Google for indexing.

  ${colors.green}node google-indexing.js <url>${colors.reset}
      Submit a specific URL (e.g. newly published blog post or page).

  ${colors.green}node google-indexing.js --check${colors.reset}
      Inspect status of all URLs from sitemap.xml without submitting new requests.

  ${colors.green}node google-indexing.js --check <url>${colors.reset}
      Inspect indexing status of a single URL.

  ${colors.green}node google-indexing.js --delete <url>${colors.reset}
      Notify Google that a URL was permanently deleted.

  ${colors.green}node google-indexing.js --help${colors.reset}
      Show this help message.
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  console.log(`\n${colors.cyan}${colors.bold}===============================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  Storify Agency - Google Instant Indexing Tool ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}===============================================${colors.reset}\n`);

  // Locate credentials
  const credPath = findCredentialsFile();
  if (!credPath) {
    console.error(`${colors.red}❌ Error: No Google Cloud service account JSON file found in this folder.${colors.reset}`);
    console.error(`Please ensure your service account JSON file is present.\n`);
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  console.log(`${colors.gray}• Service Account:${colors.reset} ${colors.green}${credentials.client_email}${colors.reset}`);
  console.log(`${colors.gray}• Credentials file:${colors.reset} ${path.basename(credPath)}`);

  // Obtain access token
  process.stdout.write(`${colors.gray}• Authenticating with Google Cloud...${colors.reset} `);
  let token;
  try {
    token = await getAccessToken(credentials);
    console.log(`${colors.green}Authenticated ✅${colors.reset}`);
  } catch (err) {
    console.log(`${colors.red}Failed ❌${colors.reset}`);
    console.error(`${colors.red}${err.message}${colors.reset}`);
    process.exit(1);
  }

  // Parse mode & targets
  const isCheckMode = args.includes('--check') || args.includes('-c');
  const isDeleteMode = args.includes('--delete');
  const customUrls = args.filter(a => !a.startsWith('-') && a.startsWith('http'));

  let targetUrls = [];
  if (customUrls.length > 0) {
    targetUrls = customUrls;
  } else {
    const sitemapPath = path.resolve(process.cwd(), 'sitemap.xml');
    try {
      targetUrls = extractSitemapUrls(sitemapPath);
      console.log(`${colors.gray}• Sitemap:${colors.reset} Loaded ${colors.bold}${targetUrls.length}${colors.reset} URLs from sitemap.xml\n`);
    } catch (err) {
      console.error(`${colors.red}❌ Error reading sitemap: ${err.message}${colors.reset}`);
      process.exit(1);
    }
  }

  const actionType = isDeleteMode ? 'URL_DELETED' : 'URL_UPDATED';
  const modeTitle = isCheckMode
    ? 'Checking Indexing Metadata Status'
    : isDeleteMode
    ? 'Sending URL Deletion Requests'
    : 'Submitting URLs for Google Indexing';

  console.log(`${colors.bold}${modeTitle} (${targetUrls.length} URLs):${colors.reset}\n`);

  let successCount = 0;
  let failureCount = 0;
  let permissionDeniedSeen = false;

  for (let i = 0; i < targetUrls.length; i++) {
    const url = targetUrls[i];
    const indexStr = `[${i + 1}/${targetUrls.length}]`.padStart(8);

    try {
      if (isCheckMode) {
        const res = await getUrlMetadata(token, url);
        if (res.ok) {
          const updateTime = res.data.latestUpdate?.notifyTime || 'No notification recorded yet';
          console.log(`${colors.cyan}${indexStr}${colors.reset} ${colors.green}✔ OK${colors.reset}  ${url} ${colors.gray}(Last notified: ${updateTime})${colors.reset}`);
          successCount++;
        } else {
          const msg = res.data?.error?.message || `HTTP ${res.status}`;
          console.log(`${colors.cyan}${indexStr}${colors.reset} ${colors.red}✖ ERR${colors.reset} ${url} ${colors.dim}(${msg})${colors.reset}`);
          failureCount++;
          if (res.status === 403 && res.data?.error?.message?.includes('Permission denied')) {
            permissionDeniedSeen = true;
          }
        }
      } else {
        const res = await publishUrlNotification(token, url, actionType);
        if (res.ok) {
          const notifyTime = res.data.urlNotificationMetadata?.latestUpdate?.notifyTime || 'Just now';
          console.log(`${colors.cyan}${indexStr}${colors.reset} ${colors.green}✔ SUBMITTED${colors.reset}  ${url} ${colors.gray}(${notifyTime})${colors.reset}`);
          successCount++;
        } else {
          const msg = res.data?.error?.message || `HTTP ${res.status}`;
          console.log(`${colors.cyan}${indexStr}${colors.reset} ${colors.red}✖ FAILED${colors.reset}     ${url} ${colors.dim}(${msg})${colors.reset}`);
          failureCount++;
          if (res.status === 403 && res.data?.error?.message?.includes('Permission denied')) {
            permissionDeniedSeen = true;
          }
        }
      }
    } catch (err) {
      console.log(`${colors.cyan}${indexStr}${colors.reset} ${colors.red}✖ ERROR${colors.reset}      ${url} ${colors.dim}(${err.message})${colors.reset}`);
      failureCount++;
    }

    // Friendly delay between requests to avoid quota bursts (150ms)
    if (i < targetUrls.length - 1) {
      await delay(150);
    }
  }

  // Summary
  console.log(`\n${colors.bold}-----------------------------------------------${colors.reset}`);
  console.log(`${colors.bold}Execution Summary:${colors.reset}`);
  console.log(`  • Total URLs processed: ${colors.bold}${targetUrls.length}${colors.reset}`);
  console.log(`  • Succeeded:            ${colors.green}${colors.bold}${successCount}${colors.reset}`);
  console.log(`  • Failed / Blocked:     ${failureCount > 0 ? colors.red : colors.gray}${colors.bold}${failureCount}${colors.reset}`);
  console.log(`${colors.bold}-----------------------------------------------${colors.reset}\n`);

  if (permissionDeniedSeen) {
    printOwnershipInstructions(credentials.client_email);
  } else if (successCount > 0 && !isCheckMode) {
    console.log(`${colors.green}${colors.bold}🎉 Google has received your indexing requests!${colors.reset}`);
    console.log(`${colors.gray}Google's bots typically visit submitted pages within hours to 1-2 days.${colors.reset}\n`);
  }
}

main().catch(err => {
  console.error(`\n${colors.red}Fatal Error:${colors.reset}`, err);
  process.exit(1);
});
