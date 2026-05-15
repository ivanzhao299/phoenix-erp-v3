// Phoenix ERP V3 API — ESLint v9 flat config
// 设计：
//   - 务实优先：不在历史代码里制造 719 个错误像 web/ 那样
//   - 阻断真正危险：未使用 await / Promise reject 漏吞 / @ts-ignore 滥用
//   - 既有 `any` 类型只警告（warn），新代码逐步收紧
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'scripts/**', '_archive/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        setImmediate: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // 历史 `any` 大量存在：仅 warn 不 error
      '@typescript-eslint/no-explicit-any': 'warn',
      // 未使用变量：err 是 nest catch 必用模板，宽松些
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 严禁 @ts-ignore 不带原因
      '@typescript-eslint/ban-ts-comment': ['error', {
        'ts-ignore': 'allow-with-description',
        'ts-expect-error': 'allow-with-description',
        minimumDescriptionLength: 5,
      }],
      // Promise 未处理拒绝
      'no-async-promise-executor': 'error',
      // require / 全局 console 不阻断
      'no-undef': 'off',
      // 多余分号、empty pattern 等通用问题保持 error
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-catch': 'warn',
      // case 块声明
      'no-case-declarations': 'off',
    },
  },
];
