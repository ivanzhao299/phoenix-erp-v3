#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTER_RULES_FILE = 'docs/ops/AGENT_ROUTER_RULES.json';
const ROUTE_ORDER = [
  'A3-Backend-Critical-Path',
  'A4-Frontend-UAT-Smoke',
  'A2-Security-Regression-Gate',
  'A1-CI-Runtime-Gate',
  'A5-Data-Readiness',
  'A6-Staging-Deploy-Runbook',
  'A7-Final-QA-Gate',
  'Codex-Orchestrator',
];

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-route-request.mjs \\
    --request "<natural language request>" \\
    [--output-json docs/ops/runs/<id>-route-plan.json] \\
    [--output-md docs/ops/runs/<id>-route-plan.md]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = {};
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      values[key] = normalized[i + 1];
      i += 1;
    }
  }
  return values;
}

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function readRouterRules(file = ROUTER_RULES_FILE) {
  return JSON.parse(readFileSync(resolvePath(file), 'utf8'));
}

function normalize(text) {
  return String(text || '').toLowerCase();
}

function includesTerm(text, term) {
  return normalize(text).includes(normalize(term));
}

function matchedTerms(text, terms = []) {
  return terms.filter((term) => includesTerm(text, term));
}

function hasAny(text, terms = []) {
  return matchedTerms(text, terms).length > 0;
}

function negated(text, terms = []) {
  return hasAny(text, terms);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function canonicalAgent(ruleKey, rule) {
  return rule.canonical_agent || rule.agent_name || ruleKey;
}

function addAgent(map, agent, reason, score = 1) {
  if (!map.has(agent)) {
    map.set(agent, { score: 0, reasons: [] });
  }
  const current = map.get(agent);
  current.score += score;
  current.reasons.push(reason);
}

function detectHeldReasons(requestText) {
  const lower = normalize(requestText);
  const held = [];
  const noMigration =
    /不(新增|创建|执行|运行|跑).*migration|不改.*schema|不修改.*schema|不改.*表结构|不修改.*表结构|no\s+migration|do\s+not\s+(run|create|add).*migration|do\s+not\s+modify\s+schema|without\s+migration/.test(
      lower,
    );
  const positiveMigration =
    /新增.*migration|创建.*migration|执行.*migration|运行.*migration|跑.*migration|修改.*schema|修改.*entity|修改.*table|修改.*column|修改.*表结构|新增.*字段|新增.*表|schema\s+change|table\s+change|column\s+change|create\s+migration|run\s+migration/.test(
      lower,
    );
  const noDeploy =
    /不(实际)?部署|不生产部署|不执行部署|no\s+deploy|do\s+not\s+deploy|without\s+deploy|not\s+deploy/.test(lower);
  const positiveDeploy =
    /部署上线|生产部署|实际部署|上线|production\s+deploy|deploy\s+production|deploy\s+to\s+prod|go\s+live/.test(lower);
  const noDbWrite = /不写库|不写.*数据库|no\s+(db|database)\s+write|do\s+not\s+write.*database|without\s+(db|database)\s+write/.test(
    lower,
  );
  const positiveDbWrite = /写库|写.*数据库|db\s+write|database\s+write|execute\s+sql|执行.*数据库/.test(lower);

  if (positiveMigration && !noMigration) {
    held.push('migration/schema/entity/table/column requires Schema Gate and human approval');
  }
  if (positiveDeploy && !noDeploy) {
    held.push('deploy/production request requires A6/A7 and human GO');
  }
  if (positiveDbWrite && !noDbWrite) {
    held.push('DB write request requires human Gate');
  }
  return held;
}

function detectDomains(requestText) {
  const text = requestText;
  const lower = normalize(text);
  const securityText = text.replace(/Store\s+Payment/gi, '');
  const securityLower = normalize(securityText);
  const ci = /ci|typecheck|测试|验证|编译|构建|启动|smoke|gate/.test(lower);
  const protectedAttachment =
    /protected\s+(attachment|preview|download)|attachment\s+(preview|download)|附件\s*protected|附件预览|附件下载/i.test(text);
  const authorizationDesign = /菜单码|角色授权|权限\s*seed|权限\s*register|后端授权|menu\s+code|role\s+authorization|permission\s+(seed|register)/i.test(
    text,
  );
  const security = /安全|权限|rbac|datascope|越权|jwt|审计|日志脱敏|敏感日志|附件权限|附件\s*acl|附件访问控制|security\s+review|payment|支付|finance|财务|chanjet|畅捷通|用友/.test(
    securityLower,
  ) || protectedAttachment || authorizationDesign;
  const dataContext =
    /数据|主数据|门店|公司|账户|角色|组织|字典|基础数据|映射|store|company|account|role|organization|master\s+data|mapping|pilot/i.test(
      text,
    );
  const dataReadiness =
    /数据准备|数据检查|数据\s*readiness|主数据|门店映射|公司映射|账户映射|角色映射|字典|组织|组织映射|基础数据|数据核查|数据就绪|试点\s*readiness|试点准备|data\s+readiness|master\s+data|store\s+mapping|company\s+mapping|account\s+mapping|role\s+mapping|organization\s+mapping|data\s+check|data\s+validation|pilot\s+readiness|A5\s*数据|A5-Data-Readiness|Data Readiness/i.test(
      text,
    ) ||
    (/\breadiness\b/i.test(text) && dataContext);
  const ui =
    /页面|前端|ui|ux|样式|美化|好看|清爽|现代化|布局|按钮|表格|表单|弹窗|抽屉|筛选|状态标签|颜色|间距|响应式|移动端|pc端|交互|用户体验|uat|frontend|style|polish|layout|button|table|form|modal|drawer|responsive|mobile|desktop/.test(
      lower,
    );
  const backend =
    /后端|接口|接口方案|后端边界|后端授权|api|api\s+draft|service|controller|module|dto|appmodule|endpoint|确认接口|新增接口/.test(
      lower,
    ) ||
    protectedAttachment ||
    authorizationDesign;
  const noBackend = /不改后端|不改后端接口|no\s+backend|do\s+not\s+modify\s+backend/.test(lower);
  const deployPlan =
    /预发|staging|部署\s*runbook|部署文档|回滚方案|环境矩阵|health\s+check|发布手册|deploy\s+runbook|deployment\s+runbook|rollback|release\s+runbook/.test(
      lower,
    );
  const finalGate = /终验|最终验收|最终\s*gate|go\s*\/?\s*hold|go\s*no\s*go|rollback|hold|回滚判断|上线判断/.test(lower);
  return {
    ci,
    security,
    dataReadiness,
    ui,
    backend: backend && !noBackend,
    backendMentionedButNegated: backend && noBackend,
    deployPlan,
    finalGate,
    protectedAttachment,
    authorizationDesign,
  };
}

function sortAgentsForRequest(agents, domains) {
  const selected = new Set(agents);
  if (domains.backend) {
    return ['A3-Backend-Critical-Path', 'A2-Security-Regression-Gate', 'A1-CI-Runtime-Gate', 'A5-Data-Readiness', 'A4-Frontend-UAT-Smoke', 'A6-Staging-Deploy-Runbook', 'A7-Final-QA-Gate', 'Codex-Orchestrator'].filter((agent) =>
      selected.has(agent),
    );
  }
  if (domains.ui) {
    return ['A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate', 'A2-Security-Regression-Gate', 'A3-Backend-Critical-Path', 'A5-Data-Readiness', 'A6-Staging-Deploy-Runbook', 'A7-Final-QA-Gate', 'Codex-Orchestrator'].filter((agent) =>
      selected.has(agent),
    );
  }
  if (domains.security || domains.ci || domains.dataReadiness) {
    return ['A2-Security-Regression-Gate', 'A1-CI-Runtime-Gate', 'A5-Data-Readiness', 'A3-Backend-Critical-Path', 'A4-Frontend-UAT-Smoke', 'A6-Staging-Deploy-Runbook', 'A7-Final-QA-Gate', 'Codex-Orchestrator'].filter((agent) =>
      selected.has(agent),
    );
  }
  if (domains.deployPlan || domains.finalGate) {
    return ['A6-Staging-Deploy-Runbook', 'A7-Final-QA-Gate', 'A1-CI-Runtime-Gate', 'A2-Security-Regression-Gate', 'Codex-Orchestrator'].filter((agent) =>
      selected.has(agent),
    );
  }
  return ROUTE_ORDER.filter((agent) => selected.has(agent));
}

function makeParallelGroups(agents, domains, heldReasons) {
  if (heldReasons.length > 0) return [];
  const groups = [];
  const readonly = agents.filter((agent) => ['A1-CI-Runtime-Gate', 'A2-Security-Regression-Gate', 'A5-Data-Readiness'].includes(agent));
  if (readonly.length > 0) groups.push(readonly);
  for (const agent of agents) {
    if (readonly.includes(agent)) continue;
    if (agent === 'A6-Staging-Deploy-Runbook' && agents.includes('A7-Final-QA-Gate')) continue;
    if (agent === 'A7-Final-QA-Gate' && agents.includes('A6-Staging-Deploy-Runbook')) {
      groups.push(['A6-Staging-Deploy-Runbook', 'A7-Final-QA-Gate']);
      continue;
    }
    groups.push([agent]);
  }
  if (domains.backend && domains.ui && agents.includes('A3-Backend-Critical-Path') && agents.includes('A4-Frontend-UAT-Smoke')) {
    return groups;
  }
  return groups;
}

function riskDomainsFor(agents, rules, heldReasons) {
  const domains = [];
  for (const [key, rule] of Object.entries(rules)) {
    if (agents.includes(canonicalAgent(key, rule))) domains.push(...(rule.risk_domains || []));
  }
  if (heldReasons.length > 0) domains.push('schema-gate', 'human-go');
  return unique(domains);
}

function confidenceFor({ selectedAgents, matchedKeywords, heldReasons, domains }) {
  if (heldReasons.length > 0) return 0.95;
  const matchCount = Object.values(matchedKeywords).reduce((sum, values) => sum + values.length, 0);
  if (selectedAgents.length === 0) return 0.3;
  let confidence = 0.52 + Math.min(0.32, matchCount * 0.04) + Math.min(0.12, selectedAgents.length * 0.03);
  if (domains.backend || domains.ui || domains.dataReadiness || domains.deployPlan) confidence += 0.08;
  if (domains.dataReadiness) confidence += 0.1;
  if (domains.deployPlan || domains.finalGate) confidence += 0.1;
  if (domains.security || domains.ci) confidence += 0.05;
  return Math.min(0.96, Number(confidence.toFixed(2)));
}

export function routeRequest(requestText, options = {}) {
  const rules = options.rules || readRouterRules(options.rulesFile || ROUTER_RULES_FILE);
  const request = String(requestText || '').trim();
  const heldReasons = detectHeldReasons(request);
  const domains = detectDomains(request);
  const scoreByAgent = new Map();
  const matchedKeywords = {};

  for (const [ruleKey, rule] of Object.entries(rules)) {
    const canonical = canonicalAgent(ruleKey, rule);
    const negativeMatches = matchedTerms(request, rule.negative_keywords || []);
    if (negativeMatches.length > 0) continue;
    const keywordMatches = unique([
      ...matchedTerms(request, rule.keywords_zh || []),
      ...matchedTerms(request, rule.keywords_en || []),
      ...matchedTerms(request, rule.explicit_mentions || []),
    ]);
    if (keywordMatches.length > 0) {
      matchedKeywords[canonical] = keywordMatches;
      const explicitCount = matchedTerms(request, rule.explicit_mentions || []).length;
      addAgent(scoreByAgent, canonical, `matched keywords: ${keywordMatches.join(', ')}`, keywordMatches.length * (rule.confidence_weight || 1) + explicitCount * 2);
    }
  }

  const a2Rule = rules['A2-Security-Regression-Gate'];
  const a2Explicit = a2Rule ? matchedTerms(request, a2Rule.explicit_mentions || []).length > 0 : false;
  if (!domains.security && !a2Explicit) {
    scoreByAgent.delete('A2-Security-Regression-Gate');
    delete matchedKeywords['A2-Security-Regression-Gate'];
  }

  if (domains.security) addAgent(scoreByAgent, 'A2-Security-Regression-Gate', 'fail-down: Auth/RBAC/DataScope/Payment/Finance/Chanjet requires A2', 3);
  if (domains.ci) addAgent(scoreByAgent, 'A1-CI-Runtime-Gate', 'fail-down: CI/typecheck/smoke requires A1', 3);
  if (domains.dataReadiness) addAgent(scoreByAgent, 'A5-Data-Readiness', 'fail-down: data readiness/master data/mapping requires A5', 4);
  if (domains.ui) addAgent(scoreByAgent, 'A4-Frontend-UAT-Smoke', 'fail-down: UI/UX/frontend requires A4', 4);
  if (domains.backend) addAgent(scoreByAgent, 'A3-Backend-Critical-Path', 'fail-down: API/service/controller/module requires A3', 4);
  if (domains.ui || domains.backend) addAgent(scoreByAgent, 'A1-CI-Runtime-Gate', 'fail-down: frontend/backend changes require A1 validation', 2);
  if (domains.deployPlan) addAgent(scoreByAgent, 'A6-Staging-Deploy-Runbook', 'fail-down: staging deploy runbook/rollback requires A6', 3);
  if (domains.deployPlan || domains.finalGate) addAgent(scoreByAgent, 'A7-Final-QA-Gate', 'fail-down: release/GO/HOLD/ROLLBACK gate requires A7', 3);
  if (heldReasons.length > 0) addAgent(scoreByAgent, 'Codex-Orchestrator', 'HOLD requires Orchestrator route-review', 2);
  if (heldReasons.length === 0 && scoreByAgent.size > 1) {
    scoreByAgent.delete('Codex-Orchestrator');
  }

  let selectedAgents = sortAgentsForRequest([...scoreByAgent.keys()], domains);
  if (heldReasons.length > 0) selectedAgents = [];

  const confidence = confidenceFor({ selectedAgents, matchedKeywords, heldReasons, domains });
  const fallbackAction =
    heldReasons.length > 0 || confidence < 0.5
      ? 'HOLD'
      : confidence < 0.8
        ? 'Codex-Orchestrator route-review'
        : 'create task pool';
  const recommendedSequence = fallbackAction === 'HOLD' ? ['Codex-Orchestrator route-review'] : selectedAgents;
  const parallelGroups = fallbackAction === 'HOLD' ? [] : makeParallelGroups(selectedAgents, domains, heldReasons);

  return {
    request,
    selected_agents: selectedAgents,
    confidence,
    matched_keywords: matchedKeywords,
    risk_domains: riskDomainsFor(selectedAgents, rules, heldReasons),
    held_reasons: heldReasons,
    recommended_sequence: recommendedSequence,
    parallel_groups: parallelGroups,
    fallback_action: fallbackAction,
    route_decision: fallbackAction === 'HOLD' ? 'HOLD' : fallbackAction === 'Codex-Orchestrator route-review' ? 'ROUTE_REVIEW' : 'PLAN_READY',
    requires_route_review: fallbackAction !== 'create task pool',
    domains,
    agent_scores: Object.fromEntries([...scoreByAgent.entries()].map(([agent, value]) => [agent, Number(value.score.toFixed(2))])),
  };
}

function writeMarkdown(plan) {
  return `# Agent Route Plan

| Field | Value |
| --- | --- |
| Decision | ${plan.route_decision} |
| Confidence | ${plan.confidence} |
| Fallback action | ${plan.fallback_action} |

## Request

${plan.request}

## Selected Agents

${plan.selected_agents.map((agent) => `- ${agent}`).join('\n') || '- None'}

## Matched Keywords

${Object.entries(plan.matched_keywords)
  .map(([agent, keywords]) => `- ${agent}: ${keywords.join(', ')}`)
  .join('\n') || '- None'}

## Risk Domains

${plan.risk_domains.map((domain) => `- ${domain}`).join('\n') || '- None'}

## Held Reasons

${plan.held_reasons.map((reason) => `- ${reason}`).join('\n') || '- None'}

## Recommended Sequence

${plan.recommended_sequence.map((agent) => `- ${agent}`).join('\n') || '- None'}

## Parallel Groups

${plan.parallel_groups.map((group, index) => `- Group ${index + 1}: ${group.join(', ')}`).join('\n') || '- None'}
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.request) usage(1);
  const plan = routeRequest(args.request);
  if (args.outputJson) {
    const outputJson = resolvePath(args.outputJson);
    mkdirSync(path.dirname(outputJson), { recursive: true });
    writeFileSync(outputJson, `${JSON.stringify(plan, null, 2)}\n`);
  }
  if (args.outputMd) {
    const outputMd = resolvePath(args.outputMd);
    mkdirSync(path.dirname(outputMd), { recursive: true });
    writeFileSync(outputMd, writeMarkdown(plan));
  }
  console.log(`Decision: ${plan.route_decision}`);
  console.log(`Confidence: ${plan.confidence}`);
  console.log(`Selected agents: ${plan.selected_agents.join(', ') || 'None'}`);
  console.log(`Parallel groups: ${plan.parallel_groups.map((group) => `[${group.join(', ')}]`).join(' ') || 'None'}`);
  console.log(`Fallback action: ${plan.fallback_action}`);
  if (plan.held_reasons.length > 0) console.log(`Held reasons: ${plan.held_reasons.join('; ')}`);
}

const currentFile = fileURLToPath(import.meta.url);
if (existsSync(currentFile) && process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}
