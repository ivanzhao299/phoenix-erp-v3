#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const baseRef = process.env.SECURITY_BASE_REF || process.env.GITHUB_BASE_REF || 'main';
const headRef = process.env.SECURITY_HEAD_REF || 'HEAD';
const allowSecurityTouch = process.env.ALLOW_SECURITY_TOUCH === 'true';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function changedFiles() {
  const files = new Set();
  const candidates = [
    [`${baseRef}...${headRef}`],
    [`origin/${baseRef}...${headRef}`],
    ['HEAD~1...HEAD'],
  ];

  for (const [range] of candidates) {
    try {
      const out = git(['diff', '--name-only', range]);
      for (const file of out.split('\n').filter(Boolean)) files.add(file);
      break;
    } catch {
      // Try next range.
    }
  }

  for (const args of [
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    try {
      const out = git(args);
      for (const file of out.split('\n').filter(Boolean)) files.add(file);
    } catch {
      // Ignore unavailable diff views.
    }
  }

  return [...files].sort();
}

const fileAllowlist = [
  /^docs\//,
  /^\.github\/pull_request_template\.md$/,
  /^\.github\/workflows\/ci-/,
  /^scripts\/ci\//,
];

const sourceFile = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const checks = [
  {
    name: 'public auth bypass decorator',
    pattern: /@(Public|SkipAuth|AllowAnonymous)\b|['"`](isPublic|skipAuth|allowAnonymous)['"`]\s*[:,]/,
    severity: 'fail',
  },
  {
    name: 'JWT fallback/env drift',
    pattern: /\b(FALLBACK_SECRET|DEV_ONLY_INSECURE_FALLBACK|process\.env\.JWT(?!_SECRET(?:_PREV)?\b)|JWT_SECRET\s*\|\|)/,
    severity: 'fail',
  },
  {
    name: 'sensitive logging',
    pattern: /console\.(log|warn|error|info|debug)\([^;\n]*(password|token|authorization|cookie|secret|signature|nonce|jwt|access_token)/i,
    severity: 'fail',
  },
  {
    name: 'Chanjet callback/signature critical path',
    pattern: /(chanjet|yonyou|callback|webhook|signature|nonce|timestamp)/i,
    severity: 'fail',
    pathPattern: /^apps\/api\/src\//,
  },
];

const files = changedFiles().filter((file) => sourceFile.test(file) && existsSync(file));
const findings = [];

for (const file of files) {
  if (fileAllowlist.some((pattern) => pattern.test(file))) continue;

  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    for (const check of checks) {
      if (check.pathPattern && !check.pathPattern.test(file)) continue;
      if (check.pattern.test(lines[i])) {
        findings.push({
          file,
          line: i + 1,
          check: check.name,
          text: lines[i].trim().slice(0, 180),
        });
      }
    }
  }
}

console.log(`check-security-regression: ${files.length} changed source file(s) inspected`);

if (findings.length) {
  for (const f of findings) {
    console.error(`SECURITY_REGRESSION: ${f.check}: ${f.file}:${f.line}: ${f.text}`);
  }

  if (!allowSecurityTouch) {
    console.error('Result: FAIL. Security-sensitive change requires review or ALLOW_SECURITY_TOUCH=true.');
    process.exit(1);
  }

  console.warn('Result: WARN. Security-sensitive change allowed by explicit override.');
  process.exit(0);
}

console.log('Result: PASS. No security regression signal found in changed source files.');
