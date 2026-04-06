#!/usr/bin/env node

/**
 * cors-audit CLI
 *
 * Usage:
 *   cors-audit <url> [options]
 *
 * Options:
 *   --origins <list>     Comma-separated allowed origins to validate
 *   --fix <platform>     Generate fix for platform (vercel, express, nextjs, nginx, etc.)
 *   --fix-all            Generate fixes for all supported platforms
 *   --json               Output results as JSON
 *   --platforms          List supported platforms
 *   --help               Show help
 *
 * Examples:
 *   cors-audit example.com
 *   cors-audit example.com --origins example.com,app.example.com
 *   cors-audit example.com --origins example.com --fix vercel
 *   cors-audit example.com --fix-all --json
 */

import { scan } from "../src/scanner.js";
import { generateFixes, listPlatforms } from "../src/fixes.js";
import { printBanner, printScanStart, printResults, printFix, printFixHeader, toJSON } from "../src/reporter.js";

const args = process.argv.slice(2);

function getFlag(name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  const next = args[i + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

async function main() {
  // ── Help ──
  if (hasFlag("help") || args.length === 0) {
    printBanner();
    console.log(`  ${c("bold", "Usage:")}  cors-audit <url> [options]`);
    console.log();
    console.log(`  ${c("bold", "Options:")}`);
    console.log(`    --origins <list>     Comma-separated allowed origins`);
    console.log(`    --fix <platform>     Generate fix config (e.g. vercel, express, nginx)`);
    console.log(`    --fix-all            Generate fixes for all platforms`);
    console.log(`    --json               Output as JSON`);
    console.log(`    --platforms          List supported platforms`);
    console.log(`    --help               Show this help`);
    console.log();
    console.log(`  ${c("bold", "Examples:")}`);
    console.log(`    cors-audit example.com`);
    console.log(`    cors-audit example.com --origins example.com,app.example.com --fix vercel`);
    console.log(`    cors-audit example.com --fix-all --json`);
    console.log();
    process.exit(0);
  }

  // ── List platforms ──
  if (hasFlag("platforms")) {
    printBanner();
    console.log(`  ${c("bold", "Supported platforms:")}`);
    for (const { key, label } of listPlatforms()) {
      console.log(`    ${c("cyan", key.padEnd(14))} ${label}`);
    }
    console.log();
    process.exit(0);
  }

  // ── Parse args ──
  // Skip values that belong to flags (e.g. --fix vercel, --origins a,b)
  const flagsWithValues = new Set(["--fix", "--origins"]);
  const url = args.find((a, i) => {
    if (a.startsWith("--")) return false;
    if (i > 0 && flagsWithValues.has(args[i - 1])) return false;
    return true;
  });
  if (!url) {
    console.error("  Error: provide a URL to scan");
    process.exit(1);
  }

  const originsRaw = getFlag("origins");
  const origins = originsRaw && typeof originsRaw === "string" ? originsRaw.split(",").map(s => s.trim()) : [];
  const fixPlatform = getFlag("fix");
  const fixAll = hasFlag("fix-all");
  const jsonOutput = hasFlag("json");

  // ── Validate platform ──
  if (fixPlatform && typeof fixPlatform === "string") {
    const platforms = listPlatforms().map(p => p.key);
    if (!platforms.includes(fixPlatform)) {
      console.error(`  Error: unknown platform "${fixPlatform}"`);
      console.error(`  Run with --platforms to see all supported platforms.`);
      process.exit(1);
    }
  }

  // ── Scan ──
  if (!jsonOutput) {
    printBanner();
    printScanStart(url);
    console.log(`  ${c("dim", "Scanning...")} ${c("dim", "(9 tests)")}`);
    console.log();
  }

  const result = await scan(url, { origins });

  // ── Generate fixes ──
  let fixes = [];
  if (fixPlatform && typeof fixPlatform === "string") {
    fixes = generateFixes(origins.length > 0 ? origins : [`https://${extractDomain(url)}`], fixPlatform);
  } else if (fixAll) {
    fixes = generateFixes(origins.length > 0 ? origins : [`https://${extractDomain(url)}`], "all");
  } else if (result.findings.some(f => ["CRITICAL", "HIGH"].includes(f.severity))) {
    // Auto-suggest the generic fix so it works for everyone
    fixes = generateFixes(origins.length > 0 ? origins : [`https://${extractDomain(url)}`], "generic");
  }

  // ── Output ──
  if (jsonOutput) {
    console.log(JSON.stringify(toJSON(result, fixes), null, 2));
  } else {
    printResults(result);

    if (fixes.length > 0) {
      printFixHeader();
      for (const fix of fixes) {
        printFix(fix);
      }
    }

    if (result.score < 80 && !fixPlatform && !fixAll) {
      console.log(`  ${c("dim", "Run with")} --fix <platform> ${c("dim", "to get your fix config.")}`);
      console.log(`  ${c("dim", "Run with")} --platforms ${c("dim", "to see all supported platforms.")}`);
      console.log();
    }
  }
}

function extractDomain(url) {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname; } catch { return url; }
}

function c(style, text) {
  const COLORS = {
    bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m",
    yellow: "\x1b[33m", blue: "\x1b[34m", cyan: "\x1b[36m", reset: "\x1b[0m",
  };
  return `${COLORS[style] || ""}${text}${COLORS.reset}`;
}

main().catch(err => {
  console.error(`  Error: ${err.message}`);
  process.exit(1);
});
