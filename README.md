# cors-audit

Scan any domain for CORS misconfigurations and get copy-paste fix configs for **22 platforms**. Zero dependencies — just Node.js.

```bash
npx cors-audit your-site.com
```

<p align="center">
<strong>9 security tests</strong> &middot; <strong>22 platform fixes</strong> &middot; <strong>JSON output for CI/CD</strong> &middot; <strong>zero dependencies</strong>
</p>

---

## Why

`Access-Control-Allow-Origin: *` is one of the most common security misconfigurations on the web. It ships by default in many starter templates and hosting platforms. Most teams don't realize it's a problem until a pentest catches it.

**cors-audit** finds the issue in seconds and gives you the exact config to fix it for your stack.

## Quick Start

```bash
# Scan a domain
npx cors-audit example.com

# Scan + tell it which origins SHOULD be allowed
npx cors-audit example.com --origins example.com,app.example.com

# Scan + get the fix for your platform
npx cors-audit example.com --origins example.com --fix vercel

# Get fixes for ALL 22 platforms at once
npx cors-audit example.com --origins example.com --fix-all

# JSON output (for CI/CD pipelines)
npx cors-audit example.com --json

# List all supported platforms
npx cors-audit --platforms
```

## What It Tests

| # | Test | Severity | What it means |
|---|------|----------|---------------|
| 1 | Wildcard `Access-Control-Allow-Origin: *` | HIGH/CRITICAL | Any website can read your responses |
| 2 | Origin reflection (echoes any origin) | CRITICAL | Server mirrors whatever Origin is sent — full bypass |
| 3 | `null` origin accepted | HIGH | Attackers can exploit via sandboxed iframes |
| 4 | Subdomain/suffix bypass | HIGH | Naive string matching (e.g. `evil-example.com` passes) |
| 5 | Credentials with wildcard | CRITICAL | Authenticated data theft possible |
| 6 | Missing `Vary: Origin` | MEDIUM | CDN cache poisoning risk |
| 7 | Permissive preflight (OPTIONS) | HIGH | Non-simple requests from attacker sites succeed |
| 8 | Legitimate origin validation | INFO | Checks your own origins aren't accidentally blocked |
| 9 | Missing security headers | MEDIUM | X-Frame-Options, CSP, etc. |

## Supported Platforms (22)

Don't see your stack? Use `--fix generic` for language-agnostic pseudocode + a common mistakes guide that works with any server.

### Hosting & Cloud

| Platform | Flag |
|----------|------|
| Any server (pseudocode) | `--fix generic` |
| Vercel | `--fix vercel` |
| Netlify | `--fix netlify` |
| Firebase | `--fix firebase` |
| AWS (API Gateway / Lambda / S3) | `--fix aws` |
| Cloudflare Workers | `--fix cloudflare` |
| Supabase | `--fix supabase` |
| Deno Deploy | `--fix deno` |

### Web Servers

| Platform | Flag |
|----------|------|
| Nginx | `--fix nginx` |
| Apache | `--fix apache` |
| Caddy | `--fix caddy` |

### Frameworks & Languages

| Platform | Flag |
|----------|------|
| Express (Node.js) | `--fix express` |
| Next.js | `--fix nextjs` |
| Fastify | `--fix fastify` |
| Hono | `--fix hono` |
| Flask (Python) | `--fix flask` |
| Django (Python) | `--fix django` |
| Laravel (PHP) | `--fix laravel` |
| Rails (Ruby) | `--fix rails` |
| Spring Boot (Java/Kotlin) | `--fix spring` |
| Go (net/http) | `--fix go` |
| ASP.NET Core (C#) | `--fix dotnet` |

## CI/CD Integration

### GitHub Actions

```yaml
- name: CORS Audit
  run: npx cors-audit ${{ vars.PROD_URL }} --json > cors-report.json

- name: Check CORS Score
  run: |
    score=$(npx cors-audit ${{ vars.PROD_URL }} --json | jq '.score')
    if [ "$score" -lt 80 ]; then
      echo "CORS score $score/100 — failing build"
      exit 1
    fi
```

### GitLab CI

```yaml
cors-audit:
  script:
    - npx cors-audit $PROD_URL --json > cors-report.json
    - score=$(cat cors-report.json | jq '.score')
    - if [ "$score" -lt 80 ]; then exit 1; fi
  artifacts:
    paths:
      - cors-report.json
```

## How It Works

1. Sends 9 probes to your domain with different `Origin` headers
2. Analyzes the `Access-Control-*` response headers for misconfigurations
3. Scores your CORS setup 0–100
4. Generates copy-paste fix configs for your platform

No API keys, no accounts, no dependencies. Just `node` and `fetch`.

## Contributing

PRs welcome — especially for new platform fix generators. Each platform is a single function in `src/fixes.js` that takes an array of allowed origins and returns a config string.

## License

MIT
