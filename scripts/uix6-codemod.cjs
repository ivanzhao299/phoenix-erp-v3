#!/usr/bin/env node
/**
 * UIX-6 JSX-aware codemod
 * 用 @babel/parser + @babel/traverse + @babel/generator 改写 JSX：
 *
 *   1. 识别 JSX 元素的 style={{...}} 简单 pattern → className={u.xxx}
 *      （含复合：fontSize+color 组合 / display:flex+align+gap 组合等）
 *   2. 自动合并已有 className：
 *      className={s.a} + className={u.b} → className={`${s.a} ${u.b}`}
 *      className="text-..." + className={u.b} → className={`text-... ${u.b}`}
 *   3. 自动添加 import u from "@/styles/uix-utils.module.css"
 *
 * 用法：node scripts/uix6-codemod.cjs <file.tsx> [<file2.tsx> ...]
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

// ── inline pattern → utility class 映射 ─────────────────────────
// key: 规范化后的 style 字符串（按字典顺序 + 单引号）；value: className key
const PATTERNS = {
  // 单属性
  "{flex:1}":                                  'flex1',
  "{textAlign:'right'}":                        'tar',
  "{textAlign:'center'}":                       'tac',
  "{whiteSpace:'nowrap'}":                      'nowrap',
  "{fontWeight:600}":                           'fw600',
  "{fontSize:11}":                              'fs11',
  "{fontSize:12}":                              'fs12',
  "{fontSize:13}":                              'fs13',
  "{fontSize:14}":                              'fs14',
  "{marginBottom:4}":                           'mb4',
  "{marginBottom:8}":                           'mb8',
  "{marginBottom:12}":                          'mb12',
  "{marginBottom:16}":                          'mb16',
  "{cursor:'pointer'}":                         'pointer',
  "{width:'100%'}":                             'w100',
  "{overflowX:'auto'}":                         'scrollX',

  // 复合（按字典顺序排列）
  "{color:'var(--text-secondary)',fontSize:12}":  'muted12',
  "{fontSize:12,color:'var(--text-secondary)'}":  'muted12',
  "{color:'var(--text-secondary)'}":              'muted',
  "{alignItems:'center',display:'flex',gap:6}":   'flexRow',
  "{alignItems:'center',display:'flex',gap:8}":   'flexRow8',
  "{alignItems:'center',display:'flex',gap:12}":  'flexRow12',
  "{alignItems:'center',display:'flex',justifyContent:'space-between'}": 'flexBetween',
  // mt4 — { margin: "4px 0 0" } 等价
  "{margin:'4px 0 0'}":                         'mt4',

  // empty state combos
  "{color:'var(--text-secondary)',padding:32,textAlign:'center'}": 'emptyCenter',
  "{color:'var(--text-secondary)',padding:40,textAlign:'center'}": 'emptyPad40',

  // UIX-6 R2 扩展（剩余高频 pattern）
  "{padding:24}":                                'p24',
  "{padding:'24px 32px',maxWidth:1200}":         'pageInner',
  "{padding:'18px 20px'}":                       'p18x20',
  "{marginBottom:14}":                          'mb14',
  "{marginBottom:20}":                          'mb20',
  "{marginBottom:24}":                          'mb24',
  "{marginTop:12}":                             'mt12',
  "{fontSize:10}":                              'fs10',
  "{fontSize:15}":                              'fs15',
  "{fontSize:16}":                              'fs16',
  "{fontSize:17}":                              'fs17',
  "{fontSize:18}":                              'fs18',
  "{fontSize:20}":                              'fs20',
  "{fontSize:22}":                              'fs22',
  "{fontSize:24}":                              'fs24',
  "{fontWeight:500}":                           'fw500',
  "{fontWeight:700}":                           'fw700',
  "{fontWeight:800}":                           'fw800',
  // grid / flex 扩展
  "{display:'flex',flexWrap:'wrap',gap:12}":   'flexWrap12',
  "{display:'flex',gap:12,flexWrap:'wrap'}":   'flexWrap12',
  "{display:'grid',gap:20,gridTemplateColumns:'1fr 1fr'}": 'grid2_20',
  "{display:'block'}":                          'block',
  "{display:'inline-block'}":                   'inlineBlock',
};

// 把 ObjectExpression 序列化成规范化字符串
function normalizeStyleNode(node) {
  if (!t.isObjectExpression(node)) return null;
  const items = [];
  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop)) return null;
    if (prop.computed) return null;
    let key;
    if (t.isIdentifier(prop.key)) key = prop.key.name;
    else if (t.isStringLiteral(prop.key)) key = prop.key.value;
    else return null;
    let val;
    if (t.isStringLiteral(prop.value)) val = `'${prop.value.value}'`;
    else if (t.isNumericLiteral(prop.value)) val = String(prop.value.value);
    else if (t.isBooleanLiteral(prop.value)) val = String(prop.value.value);
    else return null;
    items.push([key, val]);
  }
  items.sort((a, b) => a[0].localeCompare(b[0]));
  return '{' + items.map(([k, v]) => `${k}:${v}`).join(',') + '}';
}

function mergeClassNames(existing, newCls) {
  // existing: JSXAttribute value (StringLiteral / JSXExpressionContainer)
  // newCls: string token like 'u.flex1' (no quotes)
  if (!existing) return t.jsxExpressionContainer(
    t.templateLiteral([t.templateElement({ raw: '', cooked: '' }, false), t.templateElement({ raw: '', cooked: '' }, true)], [t.identifier(newCls)])
  );

  if (t.isStringLiteral(existing)) {
    // "literal" → `literal ${u.xxx}`
    return t.jsxExpressionContainer(t.templateLiteral(
      [
        t.templateElement({ raw: existing.value + ' ', cooked: existing.value + ' ' }, false),
        t.templateElement({ raw: '', cooked: '' }, true),
      ],
      [t.identifier(newCls)]
    ));
  }

  if (t.isJSXExpressionContainer(existing)) {
    const expr = existing.expression;
    if (t.isTemplateLiteral(expr)) {
      // 在末尾追加 ` ${u.xxx}`
      const lastQuasi = expr.quasis[expr.quasis.length - 1];
      lastQuasi.tail = false;
      lastQuasi.value = { raw: lastQuasi.value.raw + ' ', cooked: lastQuasi.value.cooked + ' ' };
      const newQuasi = t.templateElement({ raw: '', cooked: '' }, true);
      return t.jsxExpressionContainer(t.templateLiteral(
        [...expr.quasis, newQuasi],
        [...expr.expressions, t.identifier(newCls)]
      ));
    }
    // 任意表达式 → `${expr} ${u.xxx}`
    return t.jsxExpressionContainer(t.templateLiteral(
      [
        t.templateElement({ raw: '', cooked: '' }, false),
        t.templateElement({ raw: ' ', cooked: ' ' }, false),
        t.templateElement({ raw: '', cooked: '' }, true),
      ],
      [expr, t.identifier(newCls)]
    ));
  }
  return existing;
}

function processFile(filePath) {
  let src;
  try { src = fs.readFileSync(filePath, 'utf8'); } catch { return { ok: false, reason: 'read' }; }

  // 跳过已经污染的（变量名 'u' 冲突等 — 先简单跳过 ThemeSwitcher 自己 + design-system 内组件）
  if (filePath.includes('design-system')) return { ok: false, reason: 'ds' };
  if (filePath.includes('settings/users/page.tsx')) return { ok: false, reason: 'u-conflict' };

  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      tokens: false,
    });
  } catch (e) { return { ok: false, reason: 'parse', err: e.message }; }

  let replacements = 0;
  let needsImport = false;
  let alreadyHasImport = false;
  // 探测是否已 import uix-utils
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.source.value.includes('uix-utils')) {
      alreadyHasImport = true;
    }
  }

  // 检测变量名 'u' 是否已被占用
  let uTaken = false;
  for (const node of ast.program.body) {
    if (t.isVariableDeclaration(node)) {
      for (const d of node.declarations) {
        if (t.isIdentifier(d.id) && d.id.name === 'u') uTaken = true;
      }
    }
    if (t.isImportDeclaration(node) && !alreadyHasImport) {
      for (const spec of node.specifiers) {
        if (spec.local && spec.local.name === 'u') uTaken = true;
      }
    }
    if (t.isFunctionDeclaration(node)) {
      for (const p of node.params || []) {
        if (t.isIdentifier(p) && p.name === 'u') uTaken = true;
      }
    }
  }
  if (uTaken) return { ok: false, reason: 'u-name-taken' };

  traverse(ast, {
    JSXOpeningElement(path) {
      const styleAttrIdx = path.node.attributes.findIndex(a =>
        t.isJSXAttribute(a) && a.name && a.name.name === 'style' &&
        t.isJSXExpressionContainer(a.value) && t.isObjectExpression(a.value.expression)
      );
      if (styleAttrIdx < 0) return;
      const styleAttr = path.node.attributes[styleAttrIdx];
      const obj = styleAttr.value.expression;
      const key = normalizeStyleNode(obj);
      if (!key) return;
      const util = PATTERNS[key];
      if (!util) return;

      // 找现有 className 属性
      const cnIdx = path.node.attributes.findIndex(a =>
        t.isJSXAttribute(a) && a.name && a.name.name === 'className'
      );

      // 构造新的 className 属性
      const ref = `u.${util}`;
      // 我们直接构造 MemberExpression u.xxx
      const newExpr = t.memberExpression(t.identifier('u'), t.identifier(util));

      if (cnIdx < 0) {
        // 无 className → 新增
        const newAttr = t.jsxAttribute(
          t.jsxIdentifier('className'),
          t.jsxExpressionContainer(newExpr)
        );
        path.node.attributes[styleAttrIdx] = newAttr;
      } else {
        // 已有 className → 合并
        const existingAttr = path.node.attributes[cnIdx];
        const existingValue = existingAttr.value; // StringLiteral or JSXExpressionContainer
        let mergedAttr;
        if (t.isStringLiteral(existingValue)) {
          mergedAttr = t.jsxAttribute(
            t.jsxIdentifier('className'),
            t.jsxExpressionContainer(t.templateLiteral(
              [
                t.templateElement({ raw: existingValue.value + ' ', cooked: existingValue.value + ' ' }, false),
                t.templateElement({ raw: '', cooked: '' }, true),
              ],
              [newExpr]
            ))
          );
        } else if (t.isJSXExpressionContainer(existingValue)) {
          const expr = existingValue.expression;
          if (t.isTemplateLiteral(expr)) {
            const lastQ = expr.quasis[expr.quasis.length - 1];
            lastQ.tail = false;
            lastQ.value = { raw: lastQ.value.raw + ' ', cooked: lastQ.value.cooked + ' ' };
            expr.quasis.push(t.templateElement({ raw: '', cooked: '' }, true));
            expr.expressions.push(newExpr);
            mergedAttr = existingAttr;
          } else {
            mergedAttr = t.jsxAttribute(
              t.jsxIdentifier('className'),
              t.jsxExpressionContainer(t.templateLiteral(
                [
                  t.templateElement({ raw: '', cooked: '' }, false),
                  t.templateElement({ raw: ' ', cooked: ' ' }, false),
                  t.templateElement({ raw: '', cooked: '' }, true),
                ],
                [expr, newExpr]
              ))
            );
          }
        } else {
          return; // unknown shape
        }
        path.node.attributes[cnIdx] = mergedAttr;
        // 删除 style 属性
        path.node.attributes.splice(styleAttrIdx, 1);
      }
      replacements++;
      needsImport = true;
    }
  });

  if (!replacements) return { ok: true, replacements: 0 };

  // 如需 import 但没有
  if (needsImport && !alreadyHasImport) {
    // 找最后一条 import 后插入
    let lastImportIdx = -1;
    for (let i = 0; i < ast.program.body.length; i++) {
      if (t.isImportDeclaration(ast.program.body[i])) lastImportIdx = i;
    }
    const importDecl = t.importDeclaration(
      [t.importDefaultSpecifier(t.identifier('u'))],
      t.stringLiteral('@/styles/uix-utils.module.css')
    );
    ast.program.body.splice(lastImportIdx + 1, 0, importDecl);
  }

  const out = generate(ast, {
    retainLines: false,
    compact: false,
    jsescOption: { minimal: true },
  }, src);

  fs.writeFileSync(filePath, out.code);
  return { ok: true, replacements };
}

// ── main ──────────────────────────────────────────────────────────
const files = process.argv.slice(2);
let totalFiles = 0;
let totalReplacements = 0;
let skipped = 0;
for (const f of files) {
  const r = processFile(f);
  if (!r.ok) { skipped++; continue; }
  if (r.replacements > 0) {
    totalFiles++;
    totalReplacements += r.replacements;
  }
}
console.log(JSON.stringify({ filesChanged: totalFiles, totalReplacements, skipped }));
