#!/usr/bin/env node
/**
 * 把抓回来的 zplus markdown 整理成对接字典 docs/chanjet-zplus-api-catalog.md
 *
 * 抽取规则:
 *   - 从每个 md 解析 method + URL + 描述
 *   - 按 URL path 第 4 段 (zplus/<category>) 分组
 *   - 输出按分类的索引表(method/URL/接口名/描述/md 本地路径/官方页 URL)
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DUMP_DIR  = resolve(__dirname, '.chanjet-doc-dump/zplus');
const MANIFEST  = resolve(__dirname, '.chanjet-doc-dump/docs-manifest.json');
const OUT_FILE  = resolve(__dirname, '../docs/chanjet-zplus-api-catalog.md');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const zplusIdx = new Map(
  manifest.documents
    .filter(d => d.md_url && /\/zplus\//.test(d.md_url) && d.type === 'api')
    .map(d => [d.id, d])
);

// zplus 分类码 → 业务模块(从抓回的 markdown 标题反推 2026-06-19)
const CATEGORY_LABELS = {
  zjzt:      '账套管理(账套绑定/初始化/查询)',
  zjjcda:    '基础档案 / 主数据(部门 / 客户 / 供应商 / 存货 / 仓库 / 计量单位 / 品牌 / 项目类别 等)',
  zjcggl:    '采购管理(采购订单 / 入库单 / 申请单 / 退货单 / 发票)',
  zjxsgl:    '销售管理(销货单 / 退货单 / 发票 / 渠道分析)',
  zjkcgl:    '库存管理(出入库 / 调拨 / 盘点 / 报损 / 材料出库)',
  zjzjgl:    '资金管理(收款 / 付款 / 现金日记 / 其他收入支出)',
  hyczzgl:   '总账与会计(科目 / 期初 / 凭证 / 工资 / 报表)',
  hycgdzc:   '固定资产(新增 / 删除 / 清理 / 查询)',
  hycjggl:   '价格管理(门店 / 客户价格)',
  hyc_pjjk:  '凭据查询(销货/销售订单/发票列表内部接口)',
  ggjk:      '公共接口(单据审核/弃审/删除/自定义表单)',
  xmht:      '项目合同(项目主档 / 合同 / 执行单)',
  sjgl:      '生产加工(生产单 / BOM 类工单)',
  lsgl:      '零售管理(门店 / POS / 零售出库)',
  sggl:      '施工管理(工程验收单)',
};

function parseMd(file) {
  const text = readFileSync(resolve(DUMP_DIR, file), 'utf8');
  // 从 AUTO-FETCHED 注释提 id
  const idMatch = text.match(/id:\s*(\d+)/);
  const id = idMatch ? Number(idMatch[1]) : null;
  // 请求地址行: **请求地址**: METHOD URL
  const addr = text.match(/\*\*请求地址\*\*[::]\s*([A-Z]+)\s+(\S+)/);
  const method = addr ? addr[1] : '?';
  const url    = addr ? addr[2] : '?';
  // 描述
  const desc = (text.match(/\*\*描述\*\*[::]\s*(.+?)$/m) || [, ''])[1].trim();
  // 标题:第一个 # 后的非空标题
  const title = (text.match(/^#\s+(.+)$/m) || [, ''])[1].trim();
  // category:从 manifest 的 path 推
  const meta = id ? zplusIdx.get(id) : null;
  let category = '_misc';
  if (meta) {
    const m = meta.path.match(/\/zplus\/([^\/?]+)/);
    if (m) category = m[1];
  }
  return { id, method, url, desc, title, category, file, officialUrl: meta?.path };
}

const all = readdirSync(DUMP_DIR)
  .filter(f => f.endsWith('.md'))
  .map(parseMd)
  .filter(r => r.id);

// 按 category 分组
const byCat = new Map();
for (const r of all) {
  if (!byCat.has(r.category)) byCat.set(r.category, []);
  byCat.get(r.category).push(r);
}

// 输出
const sortedCats = [...byCat.keys()].sort();
let md = '';
md += '# 好业财(zplus)接口对接字典 v1\n\n';
md += `> **数据源**: open.chanjet.com 官方文档(2026-06-19 抓取)\n`;
md += `> **接口总数**: ${all.length}(zplus type=api,manifest 全集)\n`;
md += `> **本地 markdown**: \`scripts/.chanjet-doc-dump/zplus/<id>__<title>.md\`(已 gitignore)\n`;
md += `> **官方 manifest**: https://open.chanjet.com/md/docs-manifest.json\n`;
md += `> **官方 AI 协议**: https://open.chanjet.com/llms.txt(支持 \`?inline=true\` 一键打包 + \`/md/manifest/search\` 模糊检索)\n\n`;
md += `---\n\n`;

// 目录
md += '## 目录\n\n';
md += '| 分类码 | 中文 | 接口数 |\n|---|---|---|\n';
for (const cat of sortedCats) {
  const list = byCat.get(cat);
  const label = CATEGORY_LABELS[cat] || `(未识别:${cat})`;
  md += `| [\`${cat}\`](#${cat}) | ${label} | ${list.length} |\n`;
}
md += `\n**合计 ${all.length} 个接口**\n\n---\n\n`;

// 已知 g199 在用 / 已对接的接口高亮
const KNOWN_USED = new Map([
  ['/accounting/openapi/cc/book/findByEnterpriseId', 'g199 ✅ 账套列表(bookid 来源)'],
  ['/accounting/gl/statistics/receive/{bookid}', 'g199 ✅ 应收总账(chanjet_ar_snapshot 数据源)'],
  ['/accounting/openapi/cc/department/list/{bookid}', 'g199 ✅ 部门列表(部门对账用)'],
  ['/accounting/openapi/cc/party/custvendor/query/{bookid}', 'g199-A 待探(客户主数据)'],
  ['/accounting/openapi/cc/subject/list/{bookid}', 'g199-A 待探(科目主数据)'],
]);

// 每个分类的接口表
for (const cat of sortedCats) {
  const list = byCat.get(cat).sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method));
  const label = CATEGORY_LABELS[cat] || `(未识别)`;
  md += `## \`${cat}\` — ${label}\n\n`;
  md += `共 ${list.length} 个接口。\n\n`;
  md += '| 方法 | URL | 接口名 | 描述 | 已用 |\n|---|---|---|---|---|\n';
  for (const r of list) {
    const urlClean = r.url.replace('https://openapi.chanjet.com', '');
    const usedTag = KNOWN_USED.get(urlClean) || KNOWN_USED.get(r.url) || '';
    const descClean = (r.desc || '').replace(/\|/g, '\\|').slice(0, 60);
    const titleClean = r.title.replace(/\|/g, '\\|').slice(0, 40);
    const usedClean = usedTag ? `**${usedTag}**` : '';
    md += `| \`${r.method}\` | [\`${urlClean}\`](${r.officialUrl}) | ${titleClean} | ${descClean} | ${usedClean} |\n`;
  }
  md += '\n';
}

// 已对接清单(单独一块,方便查 ERP 哪些已用)
md += '---\n\n## 附录 A:Phoenix ERP 已对接接口(g199)\n\n';
md += '| URL | 用途 | ERP 落地 |\n|---|---|---|\n';
md += '| `GET /accounting/openapi/cc/book/findByEnterpriseId` | 账套列表 | `chanjet_book_company_map`(3 家公司种子) |\n';
md += '| `GET /accounting/gl/statistics/receive/{bookid}?period=YYYYMM` | 应收总账 | `chanjet_ar_snapshot` + `fin_ar_ledger`(审核入账) |\n';
md += '| `GET /accounting/openapi/cc/department/list/{bookid}` | 部门列表 | 部门对账(只读) |\n';
md += '\n详见 [g199-chanjet-api-field-mapping.md](g199-chanjet-api-field-mapping.md)。\n\n';

md += '## 附录 B:接口 markdown 文件路径\n\n';
md += '本地 markdown(已 gitignore):\n';
md += '```\nscripts/.chanjet-doc-dump/zplus/<id>__<title>.md\n```\n\n';
md += `查单接口:\n`;
md += '```bash\n# 按 id 查\nls scripts/.chanjet-doc-dump/zplus/ | grep "^<ID>__"\n\n# 按关键词查\nls scripts/.chanjet-doc-dump/zplus/ | grep -i "应收\\|销售\\|库存"\n\n# 重抓最新(增量,已存在的跳过)\nnode scripts/fetch-chanjet-zplus-docs.mjs\n```\n\n';
md += '## 附录 C:在线查找(无需本地 dump)\n\n';
md += '- 模糊检索: `https://open.chanjet.com/md/manifest/search?q=应收&format=md&limit=20`\n';
md += '- 单接口 md: `https://open.chanjet.com/md/docs/file/apiFile/zplus/.../<path>?id=<ID>`\n';
md += '- 一键打包某模块: `https://open.chanjet.com/md/docs/file/apiFile/zplus/<category>?inline=true`\n';
md += '- 全站 manifest: `https://open.chanjet.com/md/docs-manifest.json`\n';

writeFileSync(OUT_FILE, md);
console.log(`✅ 已写入 ${OUT_FILE}`);
console.log(`📊 分类 ${sortedCats.length} 个,接口 ${all.length} 个`);
console.log(`📋 分类清单:`);
for (const cat of sortedCats) {
  console.log(`   ${cat.padEnd(15)} ${CATEGORY_LABELS[cat] || '(未识别)'}: ${byCat.get(cat).length}`);
}
