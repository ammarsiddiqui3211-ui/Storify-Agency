#!/usr/bin/env node

/**
 * Storify Agency - IndexNow Bulk Submission Tool
 * -------------------------------------------------------------
 * Submits website URLs to Microsoft Bing, Yandex, and other search
 * engines supporting the IndexNow protocol (api.indexnow.org).
 *
 * Requirements:
 * - Node.js v18+ (uses built-in fetch and crypto, zero npm dependencies)
 * - 32-character IndexNow key file hosted at root (e.g. c610fab6c02545a4bfc5bbe6767f4425.txt)
 *
 * Usage:
 *   node indexnow-submit.js                  # Submit all URLs from sitemap.xml
 *   node indexnow-submit.js <url> [url2...]  # Submit specific URL(s)
 *   node indexnow-submit.js --generate-key   # Generate a new 32-character key & txt file
 *   node indexnow-submit.js --dry-run        # Preview the JSON payload without sending
 *   node indexnow-submit.js --help           # Show help and status code reference
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

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow';
const DEFAULT_HOST = 'agency.storifyco.com';
const MAX_URLS_PER_BATCH = 10000;

// Generate secure 32-character alphanumeric key
function generateSecureKey() {
  // 16 bytes = 32 hexadecimal characters
  return crypto.randomBytes(16).toString('hex');
}

// Locate existing IndexNow key file in current directory
function findExistingKeyFile() {
  const files = fs.readdirSync(process.cwd());
  for (const file of files) {
    if (file.endsWith('.txt')) {
      const base = path.basename(file, '.txt');
      // IndexNow keys are typically 32-128 hex/alphanumeric characters
      if (base.length >= 32 && /^[a-zA-Z0-9_-]+$/.test(base)) {
        const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8').trim();
        if (content === base) {
          return { key: base, fileName: file, filePath: path.join(process.cwd(), file) };
        }
      }
    }
  }
  return null;
}

// Extract URLs from sitemap.xml
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
    if (!url.endsWith('.xml')) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

// Parse hostname from a URL
function getHostFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    return u.hostname;
  } catch {
    return DEFAULT_HOST;
  }
}

// Print status code explanation guide
function explainStatusCode(status, statusText, responseBody) {
  console.log(`\n${colors.bold}HTTP Response: ${status} ${statusText}${colors.reset}`);
  if (responseBody) {
    console.log(`${colors.gray}Body: ${responseBody}${colors.reset}`);
  }

  switch (status) {
    case 200:
      console.log(`${colors.green}${colors.bold}✔ 200 OK${colors.reset} — URLs submitted successfully! Search engines have received and queued your URLs for immediate indexing.`);
      break;

    case 202:
      console.log(`${colors.green}${colors.bold}✔ 202 Accepted${colors.reset} — Request received! Key is valid and pending background verification by IndexNow search engines.`);
      break;

    case 400:
      console.log(`${colors.yellow}${colors.bold}✖ 400 Bad Request${colors.reset} — Invalid request format.`);
      console.log(`${colors.dim}  • Check that the request payload is valid JSON.${colors.reset}`);
      console.log(`${colors.dim}  • Check that 'host', 'key', and 'urlList' parameters are properly formed.${colors.reset}`);
      break;

    case 403:
      console.log(`${colors.red}${colors.bold}✖ 403 Forbidden${colors.reset} — Key verification failed.`);
      console.log(`${colors.dim}  • The key was not found or does not match at the keyLocation URL.${colors.reset}`);
      console.log(`${colors.dim}  • Verify that your key file (e.g. https://agency.storifyco.com/<key>.txt) is accessible publicly over HTTPS.${colors.reset}`);
      break;

    case 422:
      console.log(`${colors.red}${colors.bold}✖ 422 Unprocessable Entity${colors.reset} — URLs don't belong to host or key doesn't match.`);
      console.log(`${colors.dim}  • Ensure all URLs in urlList belong to the host specified in the 'host' parameter.${colors.reset}`);
      console.log(`${colors.dim}  • Cross-domain URLs are not allowed in a single IndexNow submission.${colors.reset}`);
      break;

    case 429:
      console.log(`${colors.yellow}${colors.bold}✖ 429 Too Many Requests${colors.reset} — Rate limit reached.`);
      console.log(`${colors.dim}  • Too many submissions were sent in a short time.${colors.reset}`);
      console.log(`${colors.dim}  • Back off and wait 10-15 minutes before submitting again.${colors.reset}`);
      break;

    default:
      console.log(`${colors.red}✖ Unexpected response (${status})${colors.reset}`);
      break;
  }
}

function printHelp() {
  console.log(`
${colors.cyan}${colors.bold}Storify Agency - IndexNow Submission Tool${colors.reset}

${colors.bold}Usage:${colors.reset}
  node indexnow-submit.js [options] [url1] [url2...]

${colors.bold}Commands & Options:${colors.reset}
  ${colors.green}node indexnow-submit.js${colors.reset}
      Submit all URLs from sitemap.xml to IndexNow (Bing, Yandex, etc.).

  ${colors.green}node indexnow-submit.js <url1> [url2]${colors.reset}
      Submit one or more specific URLs.

  ${colors.green}node indexnow-submit.js --generate-key${colors.reset}
      Generate a new 32-character secure alphanumeric key and create the key.txt file.

  ${colors.green}node indexnow-submit.js --dry-run${colors.reset}
      Display the JSON payload that would be sent without making the actual HTTP request.

  ${colors.green}node indexnow-submit.js --help${colors.reset}
      Show this help message and IndexNow status codes reference.

${colors.bold}IndexNow Response Status Codes Reference:${colors.reset}
  ${colors.green}200 OK${colors.reset}                    URL(s) submitted and processed successfully.
  ${colors.green}202 Accepted${colors.reset}              Request accepted; key is pending verification.
  ${colors.yellow}400 Bad Request${colors.reset}           Invalid format or missing required JSON parameters.
  ${colors.red}403 Forbidden${colors.reset}             Key is invalid or does not match keyLocation file content.
  ${colors.red}422 Unprocessable Entity${colors.reset}    URLs in urlList do not match the specified host.
  ${colors.yellow}429 Too Many Requests${colors.reset}      Rate limit reached; wait and retry later.
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // Handle key generation mode
  if (args.includes('--generate-key')) {
    const newKey = generateSecureKey();
    const fileName = `${newKey}.txt`;
    const filePath = path.join(process.cwd(), fileName);
    fs.writeFileSync(filePath, newKey, 'utf8');

    console.log(`\n${colors.green}${colors.bold}✔ Successfully generated new IndexNow key!${colors.reset}`);
    console.log(`  • Key:      ${colors.cyan}${colors.bold}${newKey}${colors.reset} (32 characters)`);
    console.log(`  • File:     ${colors.bold}${fileName}${colors.reset}`);
    console.log(`  • Location: ${filePath}`);
    console.log(`\n${colors.yellow}Make sure this file is committed and deployed so it is reachable at:${colors.reset}`);
    console.log(`  https://${DEFAULT_HOST}/${fileName}\n`);
    return;
  }

  console.log(`\n${colors.cyan}${colors.bold}===============================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}     IndexNow Bulk Submission (Bing / Search)  ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}===============================================${colors.reset}\n`);

  // Detect key file
  let keyInfo = findExistingKeyFile();
  if (!keyInfo) {
    console.log(`${colors.yellow}⚠️ No existing IndexNow key file found. Generating one now...${colors.reset}`);
    const newKey = generateSecureKey();
    const fileName = `${newKey}.txt`;
    const filePath = path.join(process.cwd(), fileName);
    fs.writeFileSync(filePath, newKey, 'utf8');
    keyInfo = { key: newKey, fileName, filePath };
    console.log(`${colors.green}✔ Created key file: ${fileName}${colors.reset}\n`);
  }

  const { key, fileName } = keyInfo;

  // Extract target URLs
  const customUrls = args.filter(a => !a.startsWith('-') && a.startsWith('http'));
  let targetUrls = [];

  if (customUrls.length > 0) {
    targetUrls = customUrls;
  } else {
    const sitemapPath = path.resolve(process.cwd(), 'sitemap.xml');
    try {
      targetUrls = extractSitemapUrls(sitemapPath);
      console.log(`${colors.gray}• Sitemap:${colors.reset} Loaded ${colors.bold}${targetUrls.length}${colors.reset} URLs from sitemap.xml`);
    } catch (err) {
      console.error(`${colors.red}❌ Error reading sitemap: ${err.message}${colors.reset}`);
      process.exit(1);
    }
  }

  if (targetUrls.length === 0) {
    console.error(`${colors.red}❌ No valid URLs to submit.${colors.reset}`);
    process.exit(1);
  }

  // Derive host from the first URL
  const host = getHostFromUrl(targetUrls[0]);
  const keyLocation = `https://${host}/${fileName}`;

  console.log(`${colors.gray}• Host:${colors.reset}        ${colors.cyan}${host}${colors.reset}`);
  console.log(`${colors.gray}• Key:${colors.reset}         ${colors.green}${key}${colors.reset}`);
  console.log(`${colors.gray}• Key Location:${colors.reset} ${keyLocation}`);
  console.log(`${colors.gray}• Total URLs:${colors.reset}   ${colors.bold}${targetUrls.length}${colors.reset}\n`);

  // Build JSON schema
  const payload = {
    host,
    key,
    keyLocation,
    urlList: targetUrls
  };

  const isDryRun = args.includes('--dry-run');
  if (isDryRun) {
    console.log(`${colors.yellow}${colors.bold}[DRY RUN MODE] The following payload would be sent:${colors.reset}\n`);
    console.log(JSON.stringify(payload, null, 2));
    console.log(`\n${colors.gray}Endpoint: ${INDEXNOW_ENDPOINT}${colors.reset}\n`);
    return;
  }

  // Submit to IndexNow API
  console.log(`${colors.cyan}Submitting ${targetUrls.length} URL(s) to IndexNow (${INDEXNOW_ENDPOINT})...${colors.reset}`);

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const bodyText = await response.text();
    explainStatusCode(response.status, response.statusText, bodyText);

    if (response.status === 200 || response.status === 202) {
      console.log(`\n${colors.green}${colors.bold}🎉 IndexNow submission completed successfully!${colors.reset}`);
      console.log(`${colors.gray}Microsoft Bing, Yandex, and participating search engines will begin indexing.${colors.reset}\n`);
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`\n${colors.red}${colors.bold}Network Error:${colors.reset} ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n${colors.red}Fatal Error:${colors.reset}`, err);
  process.exit(1);
});
