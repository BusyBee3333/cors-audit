# cors-audit

Scan any domain for CORS misconfigurations and get copy-paste fix configs for 10 platforms.

## Quick Start

```bash
npx cors-audit example.com
```

## What It Tests

| # | Test | Severity |
|---|------|----------|
| 1 | Wildcard `Access-Control-Allow-Origin: *` | HIGH/CRITICAL |
| 2 | Origin reflection (echoes any origin) | CRITICAL |
| 3 | `null` origin accepted | HIGH |
| 4 | Subdomain/suffix bypass (naive string matching) | HIGH |
| 5 | Credentials with wildcard | CRITICAL |
| 6 | Missing `Vary: Origin` header | MEDIUM |
| 7 | Permissive preflight (OPTIONS) | HIGH |
| 8 | Legitimate origin validation | INFO |
| 9 | Missing security headers | MEDIUM |

## Usage

```bash
# Basic scan
cors-audit example.com

# Scan + validate your allowed origins
cors-audit example.com --origins example.com,app.example.com

# Scan + get fix config for your platform
cors-audit example.com --origins example.com --fix vercel

# Get fixes for ALL platforms
cors-audit example.com --origins example.com --fix-all

# JSON output (for CI/CD pipelines)
cors-audit example.com --json

# List supported platforms
cors-audit --platforms
```

## Supported Platforms

| Platform | Flag |
|----------|------|
| Vercel | `--fix vercel` |
| Express | `--fix express` |
| Next.js | `--fix nextjs` |
| Nginx | `--fix nginx` |
| Cloudflare Workers | `--fix cloudflare` |
| Fastify | `--fix fastify` |
| Netlify | `--fix netlify` |
| Flask | `--fix flask` |
| Django | `--fix django` |
| Rails | `--fix rails` |

## CI/CD Integration

```yaml
# GitHub Actions
- name: CORS Audit
  run: npx cors-audit ${{ env.PROD_URL }} --json > cors-report.json

# Fail the build if score is below threshold
- name: Check CORS Score
  run: |
    score=$(npx cors-audit ${{ env.PROD_URL }} --json | jq '.score')
    if [ "$score" -lt 80 ]; then echo "CORS score too low: $score"; exit 1; fi
```

## License

MIT
