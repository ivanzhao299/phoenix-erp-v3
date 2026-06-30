#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function trackedFrontendSources() {
  return git(['ls-files', 'apps/web/src'])
    .split('\n')
    .filter(Boolean)
    .filter(file => /\.(ts|tsx|js|jsx)$/.test(file));
}

const allowlist = [
  /^apps\/web\/src\/lib\/attachments\.ts$/,
  /^apps\/web\/src\/app\/\(admin\)\/store-payment\/page\.tsx$/,
  // 单测夹具：测试 isUnsafeAttachmentRef 必含 /uploads/、http:// 等"反例"字面量，
  //   且 __tests__ 不是上线 UI 面，安全规则（禁裸暴露）不适用，整目录豁免。
  /^apps\/web\/src\/__tests__\//,
];

const checks = [
  {
    name: 'literal uploads path',
    pattern: /['"`][^'"`]*\/?uploads\//i,
  },
  {
    name: 'rawUrl usage outside protected Store Payment UI',
    pattern: /\brawUrl\b/,
  },
  {
    name: 'direct window.open usage',
    pattern: /\bwindow\.open\s*\(/,
  },
  {
    name: 'attachment-shaped direct href',
    pattern: /href=\{[^}\n]*(attachment|voucher|contract|receipt|file|url)[^}\n]*\}/i,
  },
];

const findings = [];

for (const file of trackedFrontendSources()) {
  if (allowlist.some(pattern => pattern.test(file))) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const check of checks) {
      if (check.pattern.test(line)) {
        findings.push({
          file,
          line: i + 1,
          check: check.name,
          text: line.trim().slice(0, 180),
        });
      }
    }
  }
}

console.log(`check-unsafe-attachment-refs: inspected ${trackedFrontendSources().length} frontend source file(s)`);

if (findings.length) {
  for (const finding of findings) {
    console.error(`UNSAFE_ATTACHMENT_REF: ${finding.check}: ${finding.file}:${finding.line}: ${finding.text}`);
  }
  console.error('Result: FAIL. Use AttachmentUploader / ManagedAttachmentUploader or a module protected endpoint; do not expose raw /uploads, rawUrl, or direct attachment hrefs.');
  process.exit(1);
}

console.log('Result: PASS. No unsafe frontend attachment reference pattern found.');
