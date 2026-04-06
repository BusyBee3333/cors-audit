/**
 * Pretty terminal reporter for scan results.
 */

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

const SEVERITY_COLORS = {
  CRITICAL: "red",
  HIGH: "yellow",
  MEDIUM: "magenta",
  LOW: "cyan",
  INFO: "blue",
};

const BADGE = {
  CRITICAL: `${COLORS.bgRed}${COLORS.white}${COLORS.bold} CRITICAL ${COLORS.reset}`,
  HIGH: `${COLORS.bgYellow}${COLORS.bold} HIGH ${COLORS.reset}`,
  MEDIUM: `${COLORS.bgMagenta}${COLORS.white} MEDIUM ${COLORS.reset}`,
  LOW: `${COLORS.bgBlue}${COLORS.white} LOW ${COLORS.reset}`,
  INFO: `${COLORS.bgBlue}${COLORS.white} INFO ${COLORS.reset}`,
};

export function printBanner() {
  console.log();
  console.log(c("cyan", "  ┌─────────────────────────────────────┐"));
  console.log(c("cyan", "  │") + c("bold", "        cors-audit v1.0.0             ") + c("cyan", "│"));
  console.log(c("cyan", "  │") + c("dim", "   Scan & fix CORS misconfigurations  ") + c("cyan", "│"));
  console.log(c("cyan", "  └─────────────────────────────────────┘"));
  console.log();
}

export function printScanStart(url) {
  console.log(c("dim", "  Target:  ") + c("bold", url));
  console.log(c("dim", "  ─────────────────────────────────────────"));
  console.log();
}

export function printResults(result) {
  const { findings, score } = result;

  // Score
  const scoreColor = score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
  console.log(c("bold", "  CORS Security Score: ") + c(scoreColor, `${score}/100`));
  console.log();

  if (findings.length === 0) {
    console.log(c("green", "  No CORS issues found."));
    console.log();
    return;
  }

  // Group by severity
  const grouped = {};
  for (const f of findings) {
    (grouped[f.severity] ||= []).push(f);
  }

  const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
  for (const sev of order) {
    if (!grouped[sev]) continue;
    for (const f of grouped[sev]) {
      console.log(`  ${BADGE[sev]}  ${c("bold", f.title)}`);
      console.log(`  ${c("dim", f.detail)}`);
      if (f.header) {
        console.log(`  ${c("cyan", "  " + f.header)}`);
      }
      console.log();
    }
  }

  // Summary
  const counts = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const parts = order.filter(s => counts[s]).map(s => c(SEVERITY_COLORS[s], `${counts[s]} ${s}`));
  console.log(c("dim", "  ─────────────────────────────────────────"));
  console.log(`  ${c("bold", "Summary:")} ${parts.join(c("dim", " · "))}`);
  console.log();
}

export function printFix(fix) {
  console.log(c("dim", "  ─────────────────────────────────────────"));
  console.log(`  ${c("bold", fix.label)}`);
  console.log(c("dim", "  ─────────────────────────────────────────"));
  console.log();
  // Indent every line of the code block
  for (const line of fix.code.split("\n")) {
    console.log(`  ${c("dim", line)}`);
  }
  console.log();
}

export function printFixHeader() {
  console.log();
  console.log(c("cyan", "  ┌─────────────────────────────────────┐"));
  console.log(c("cyan", "  │") + c("bold", "        Recommended Fixes             ") + c("cyan", "│"));
  console.log(c("cyan", "  └─────────────────────────────────────┘"));
  console.log();
}

/**
 * Return scan results as a JSON report object.
 */
export function toJSON(result, fixes) {
  return {
    url: result.url,
    score: result.score,
    findings: result.findings,
    fixes: fixes.map(f => ({ platform: f.platform, label: f.label, config: f.code })),
    scannedAt: new Date().toISOString(),
  };
}
