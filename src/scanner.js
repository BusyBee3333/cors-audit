/**
 * CORS Scanner — probes a target for common CORS misconfigurations.
 *
 * Tests performed:
 *  1. Wildcard origin (Access-Control-Allow-Origin: *)
 *  2. Origin reflection (echoes back any Origin we send)
 *  3. Null origin accepted
 *  4. Subdomain matching bypass (e.g. evil-example.com)
 *  5. Credentials with wildcard (caught in test 1 with elevated severity)
 *  6. Missing Vary: Origin header
 *  7. Pre-flight (OPTIONS) behavior
 *  8. Legitimate origin validation (when --origins provided)
 *  9. Missing security headers (X-Frame-Options, CSP, etc.)
 */

const SEVERITY = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW", info: "INFO" };

/**
 * @param {string} url
 * @param {Object} [options]
 * @param {string[]} [options.origins] - Allowed origins to test against
 * @param {boolean} [options.verbose]
 * @returns {Promise<{url: string, findings: Finding[], headers: Record<string, string>, score: number}>}
 */
export async function scan(url, options = {}) {
  const target = normalizeUrl(url);
  const findings = [];
  const origins = options.origins || [];

  // ── Baseline request (no Origin header) ──
  const baseline = await probe(target);
  if (!baseline.ok) {
    return { url: target, findings: [{ id: "UNREACHABLE", severity: SEVERITY.info, title: "Target unreachable", detail: baseline.error }], headers: {}, score: -1 };
  }

  // ── Test 1: Wildcard ──
  const acao = baseline.headers["access-control-allow-origin"];
  if (acao === "*") {
    const creds = baseline.headers["access-control-allow-credentials"];
    findings.push({
      id: "WILDCARD",
      severity: creds === "true" ? SEVERITY.critical : SEVERITY.high,
      title: "Wildcard Access-Control-Allow-Origin",
      detail: `The server returns Access-Control-Allow-Origin: * for all requests.${creds === "true" ? " Combined with Access-Control-Allow-Credentials: true, this is exploitable for authenticated data theft." : " Any website can read responses from this origin."}`,
      header: `access-control-allow-origin: ${acao}`,
    });
  }

  // ── Test 2: Origin reflection ──
  const evilOrigins = [
    "https://evil.com",
    "https://attacker.example.com",
    `https://not-${extractDomain(target)}`,
  ];

  for (const evil of evilOrigins) {
    const res = await probe(target, { Origin: evil });
    const reflected = res.headers["access-control-allow-origin"];
    if (reflected === evil) {
      findings.push({
        id: "ORIGIN_REFLECTION",
        severity: SEVERITY.critical,
        title: "Origin reflection (mirrors any Origin)",
        detail: `Sent Origin: ${evil} — server reflected it back in Access-Control-Allow-Origin. An attacker site can read authenticated responses.`,
        header: `access-control-allow-origin: ${reflected}`,
      });
      break; // one proof is enough
    }
  }

  // ── Test 3: Null origin ──
  const nullRes = await probe(target, { Origin: "null" });
  if (nullRes.headers["access-control-allow-origin"] === "null") {
    findings.push({
      id: "NULL_ORIGIN",
      severity: SEVERITY.high,
      title: "Null origin accepted",
      detail: "The server accepts Origin: null. Attackers can trigger null origins via sandboxed iframes or data: URIs to bypass CORS.",
      header: "access-control-allow-origin: null",
    });
  }

  // ── Test 4: Subdomain / suffix bypass ──
  const domain = extractDomain(target);
  const bypasses = [
    `https://evil-${domain}`,       // suffix match
    `https://${domain}.evil.com`,   // prefix match
    `https://sub.${domain}`,        // arbitrary subdomain
  ];
  for (const origin of bypasses) {
    const res = await probe(target, { Origin: origin });
    const val = res.headers["access-control-allow-origin"];
    if (val === origin) {
      findings.push({
        id: "SUBDOMAIN_BYPASS",
        severity: SEVERITY.high,
        title: "Subdomain / suffix origin bypass",
        detail: `Origin "${origin}" was accepted. The server likely uses a naive string match (contains/endsWith) instead of exact comparison.`,
        header: `access-control-allow-origin: ${val}`,
      });
    }
  }

  // ── Test 5: Credentials with wildcard ──
  // Already captured in Test 1 with elevated severity when both conditions are true.

  // ── Test 6: Missing Vary: Origin ──
  if (acao && acao !== "*") {
    const vary = (baseline.headers["vary"] || "").toLowerCase();
    if (!vary.includes("origin")) {
      findings.push({
        id: "MISSING_VARY",
        severity: SEVERITY.medium,
        title: "Missing Vary: Origin header",
        detail: "When Access-Control-Allow-Origin is dynamic, the Vary header must include Origin. Without it, CDN/proxy caches may serve a response with another user's allowed origin, enabling cache poisoning.",
        header: `vary: ${baseline.headers["vary"] || "(not set)"}`,
      });
    }
  }

  // ── Test 7: Preflight check ──
  const preflight = await probe(target, {
    Origin: "https://evil.com",
    "Access-Control-Request-Method": "PUT",
    "Access-Control-Request-Headers": "Authorization, Content-Type",
  }, "OPTIONS");

  const preAcao = preflight.headers["access-control-allow-origin"];
  const preMethods = preflight.headers["access-control-allow-methods"];
  if (preAcao === "*" || preAcao === "https://evil.com") {
    findings.push({
      id: "PREFLIGHT_PERMISSIVE",
      severity: SEVERITY.high,
      title: "Preflight allows arbitrary origins",
      detail: `OPTIONS preflight returned Access-Control-Allow-Origin: ${preAcao} and Access-Control-Allow-Methods: ${preMethods || "(not set)"}. Non-simple requests from attacker sites will succeed.`,
      header: `access-control-allow-origin: ${preAcao}`,
    });
  }

  // ── Test 8: Allowed origins validation ──
  if (origins.length > 0) {
    for (const allowed of origins) {
      const full = allowed.startsWith("http") ? allowed : `https://${allowed}`;
      const res = await probe(target, { Origin: full });
      const val = res.headers["access-control-allow-origin"];
      if (val !== full && val !== "*") {
        findings.push({
          id: "LEGIT_ORIGIN_REJECTED",
          severity: SEVERITY.info,
          title: `Legitimate origin not allowed: ${allowed}`,
          detail: `Your origin "${full}" is not returned in ACAO. This may cause issues for your own frontend.`,
          header: `access-control-allow-origin: ${val || "(not set)"}`,
        });
      }
    }
  }

  // ── Test 9: Security headers check ──
  const missingHeaders = [];
  const headerChecks = [
    ["x-frame-options", "X-Frame-Options"],
    ["x-content-type-options", "X-Content-Type-Options"],
    ["content-security-policy", "Content-Security-Policy"],
    ["referrer-policy", "Referrer-Policy"],
  ];
  for (const [key, name] of headerChecks) {
    if (!baseline.headers[key]) missingHeaders.push(name);
  }
  if (missingHeaders.length > 0) {
    findings.push({
      id: "MISSING_SECURITY_HEADERS",
      severity: SEVERITY.medium,
      title: "Missing security headers",
      detail: `The following security headers are not set: ${missingHeaders.join(", ")}. These should be added alongside CORS fixes.`,
    });
  }

  // ── Score ──
  const score = computeScore(findings);

  return {
    url: target,
    findings,
    headers: baseline.headers,
    score,
  };
}

// ── helpers ──

function normalizeUrl(input) {
  let u = input.trim();
  if (!u.startsWith("http")) u = "https://" + u;
  return u.replace(/\/+$/, "");
}

function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

async function probe(url, extraHeaders = {}, method = "GET") {
  try {
    const res = await fetch(url, {
      method,
      headers: { "User-Agent": "cors-audit/1.0", ...extraHeaders },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    const headers = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return { ok: true, status: res.status, headers };
  } catch (err) {
    return { ok: false, error: err.message, headers: {} };
  }
}

function computeScore(findings) {
  let score = 100;
  for (const f of findings) {
    if (f.severity === SEVERITY.critical) score -= 30;
    else if (f.severity === SEVERITY.high) score -= 15;
    else if (f.severity === SEVERITY.medium) score -= 5;
  }
  return Math.max(0, score);
}
