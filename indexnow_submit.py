#!/usr/bin/env python3
"""
Storify Agency - IndexNow Bulk Submission Tool (Python)
-------------------------------------------------------------
Submits website URLs to Microsoft Bing, Yandex, and other search
engines supporting the IndexNow protocol (api.indexnow.org).

Requirements:
- Python 3.8+ (uses standard library urllib and json, zero dependencies)

Usage:
  python indexnow_submit.py                 # Submit all URLs from sitemap.xml
  python indexnow_submit.py <url1> [url2]   # Submit specific URL(s)
  python indexnow_submit.py --generate-key  # Generate a new 32-character key & txt file
  python indexnow_submit.py --dry-run       # Preview the JSON payload without sending
  python indexnow_submit.py --help          # Show help and status code reference
"""

import os
import sys
import json
import re
import secrets
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow"
DEFAULT_HOST = "agency.storifyco.com"

# Terminal ANSI colors
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
BOLD = "\033[1m"
RESET = "\033[0m"
DIM = "\033[2m"


def generate_secure_key() -> str:
    """Generate a secure 32-character alphanumeric hexadecimal key."""
    return secrets.token_hex(16)


def find_existing_key_file():
    """Look for an existing IndexNow key file matching key.txt pattern."""
    for file in os.listdir(os.getcwd()):
        if file.endswith(".txt"):
            base, _ = os.path.splitext(file)
            if len(base) >= 32 and re.match(r"^[a-zA-Z0-9_-]+$", base):
                filepath = os.path.join(os.getcwd(), file)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        content = f.read().strip()
                        if content == base:
                            return base, file, filepath
                except Exception:
                    continue
    return None, None, None


def extract_sitemap_urls(sitemap_path: str):
    """Extract all <loc> URLs from local sitemap.xml."""
    if not os.path.exists(sitemap_path):
        raise FileNotFoundError(f"Sitemap file not found at: {sitemap_path}")

    with open(sitemap_path, "r", encoding="utf-8") as f:
        content = f.read()

    loc_regex = re.compile(r"<loc>(https?://[^<]+)</loc>", re.IGNORECASE)
    urls = []
    for match in loc_regex.finditer(content):
        url = match.group(1).strip()
        if not url.endswith(".xml"):
            urls.append(url)

    # Return deduplicated preserving order
    return list(dict.fromkeys(urls))


def explain_status_code(status_code: int, reason: str, body: str):
    """Print detailed explanations for IndexNow API response codes."""
    print(f"\n{BOLD}HTTP Response: {status_code} {reason}{RESET}")
    if body:
        print(f"{DIM}Body: {body}{RESET}")

    if status_code == 200:
        print(f"{GREEN}{BOLD}✔ 200 OK{RESET} — URLs submitted successfully! Search engines have received and queued your URLs for immediate indexing.")
    elif status_code == 202:
        print(f"{GREEN}{BOLD}✔ 202 Accepted{RESET} — Request received! Key is valid and pending background verification by IndexNow search engines.")
    elif status_code == 400:
        print(f"{YELLOW}{BOLD}✖ 400 Bad Request{RESET} — Invalid request format.")
        print(f"{DIM}  • Check that the request payload is valid JSON.{RESET}")
        print(f"{DIM}  • Check that 'host', 'key', and 'urlList' parameters are properly formed.{RESET}")
    elif status_code == 403:
        print(f"{RED}{BOLD}✖ 403 Forbidden{RESET} — Key verification failed.")
        print(f"{DIM}  • The key was not found or does not match at the keyLocation URL.{RESET}")
        print(f"{DIM}  • Verify that your key file (e.g. https://agency.storifyco.com/<key>.txt) is accessible publicly over HTTPS.{RESET}")
    elif status_code == 422:
        print(f"{RED}{BOLD}✖ 422 Unprocessable Entity{RESET} — URLs don't belong to host or key doesn't match.")
        print(f"{DIM}  • Ensure all URLs in urlList belong to the host specified in the 'host' parameter.{RESET}")
        print(f"{DIM}  • Cross-domain URLs are not allowed in a single IndexNow submission.{RESET}")
    elif status_code == 429:
        print(f"{YELLOW}{BOLD}✖ 429 Too Many Requests{RESET} — Rate limit reached.")
        print(f"{DIM}  • Too many submissions were sent in a short time.{RESET}")
        print(f"{DIM}  • Back off and wait 10-15 minutes before submitting again.{RESET}")
    else:
        print(f"{RED}✖ Unexpected response ({status_code}){RESET}")


def main():
    args = sys.argv[1:]

    if "--help" in args or "-h" in args:
        print(f"""
{CYAN}{BOLD}Storify Agency - IndexNow Submission Tool (Python){RESET}

{BOLD}Usage:{RESET}
  python indexnow_submit.py [options] [url1] [url2...]

{BOLD}Commands & Options:{RESET}
  {GREEN}python indexnow_submit.py{RESET}
      Submit all URLs from sitemap.xml to IndexNow (Bing, Yandex, etc.).

  {GREEN}python indexnow_submit.py <url1> [url2]{RESET}
      Submit one or more specific URLs.

  {GREEN}python indexnow_submit.py --generate-key{RESET}
      Generate a new 32-character secure alphanumeric key and create the key.txt file.

  {GREEN}python indexnow_submit.py --dry-run{RESET}
      Display the JSON payload that would be sent without making the actual HTTP request.

  {GREEN}python indexnow_submit.py --help{RESET}
      Show this help message and IndexNow status codes reference.

{BOLD}IndexNow Response Status Codes Reference:{RESET}
  {GREEN}200 OK{RESET}                    URL(s) submitted and processed successfully.
  {GREEN}202 Accepted{RESET}              Request accepted; key is pending verification.
  {YELLOW}400 Bad Request{RESET}           Invalid format or missing required JSON parameters.
  {RED}403 Forbidden{RESET}             Key is invalid or does not match keyLocation file content.
  {RED}422 Unprocessable Entity{RESET}    URLs in urlList do not match the specified host.
  {YELLOW}429 Too Many Requests{RESET}      Rate limit reached; wait and retry later.
""")
        return

    if "--generate-key" in args:
        new_key = generate_secure_key()
        file_name = f"{new_key}.txt"
        file_path = os.path.join(os.getcwd(), file_name)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_key)

        print(f"\n{GREEN}{BOLD}✔ Successfully generated new IndexNow key!{RESET}")
        print(f"  • Key:      {CYAN}{BOLD}{new_key}{RESET} (32 characters)")
        print(f"  • File:     {BOLD}{file_name}{RESET}")
        print(f"  • Location: {file_path}")
        print(f"\n{YELLOW}Make sure this file is committed and deployed so it is reachable at:{RESET}")
        print(f"  https://{DEFAULT_HOST}/{file_name}\n")
        return

    print(f"\n{CYAN}{BOLD}==============================================={RESET}")
    print(f"{CYAN}{BOLD}     IndexNow Bulk Submission (Bing / Search)  {RESET}")
    print(f"{CYAN}{BOLD}==============================================={RESET}\n")

    # Find or generate key
    key, file_name, file_path = find_existing_key_file()
    if not key:
        print(f"{YELLOW}⚠️ No existing IndexNow key file found. Generating one now...{RESET}")
        key = generate_secure_key()
        file_name = f"{key}.txt"
        file_path = os.path.join(os.getcwd(), file_name)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(key)
        print(f"{GREEN}✔ Created key file: {file_name}{RESET}\n")

    # Target URLs
    custom_urls = [a for a in args if not a.startswith("-") and a.startswith("http")]
    if custom_urls:
        target_urls = custom_urls
    else:
        sitemap_path = os.path.join(os.getcwd(), "sitemap.xml")
        try:
            target_urls = extract_sitemap_urls(sitemap_path)
            print(f"{DIM}• Sitemap:{RESET} Loaded {BOLD}{len(target_urls)}{RESET} URLs from sitemap.xml")
        except Exception as e:
            print(f"{RED}❌ Error reading sitemap: {e}{RESET}")
            sys.exit(1)

    if not target_urls:
        print(f"{RED}❌ No valid URLs to submit.{RESET}")
        sys.exit(1)

    # Derive host from first URL
    parsed = urlparse(target_urls[0])
    host = parsed.netloc or DEFAULT_HOST
    key_location = f"https://{host}/{file_name}"

    print(f"{DIM}• Host:{RESET}        {CYAN}{host}{RESET}")
    print(f"{DIM}• Key:{RESET}         {GREEN}{key}{RESET}")
    print(f"{DIM}• Key Location:{RESET} {key_location}")
    print(f"{DIM}• Total URLs:{RESET}   {BOLD}{len(target_urls)}{RESET}\n")

    payload = {
        "host": host,
        "key": key,
        "keyLocation": key_location,
        "urlList": target_urls
    }

    if "--dry-run" in args:
        print(f"{YELLOW}{BOLD}[DRY RUN MODE] The following payload would be sent:{RESET}\n")
        print(json.dumps(payload, indent=2))
        print(f"\n{DIM}Endpoint: {INDEXNOW_ENDPOINT}{RESET}\n")
        return

    print(f"{CYAN}Submitting {len(target_urls)} URL(s) to IndexNow ({INDEXNOW_ENDPOINT})...{RESET}")

    json_bytes = json.dumps(payload).encode("utf-8")
    req = Request(
        INDEXNOW_ENDPOINT,
        data=json_bytes,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST"
    )

    try:
        with urlopen(req) as resp:
            status = resp.status
            reason = resp.reason
            body = resp.read().decode("utf-8")
            explain_status_code(status, reason, body)
            if status in (200, 202):
                print(f"\n{GREEN}{BOLD}🎉 IndexNow submission completed successfully!{RESET}")
                print(f"{DIM}Microsoft Bing, Yandex, and participating search engines will begin indexing.{RESET}\n")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        explain_status_code(e.code, e.reason, body)
        sys.exit(1)
    except URLError as e:
        print(f"\n{RED}{BOLD}Network Error:{RESET} {e.reason}")
        sys.exit(1)


if __name__ == "__main__":
    main()
