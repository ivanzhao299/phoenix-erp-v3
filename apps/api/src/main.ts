import 'dotenv/config';            // 必须在 AppModule 之前 — 否则 auth.service 文件级 const JWT_SECRET 在 ConfigModule 加载 .env 之前就取了 FALLBACK，与 jwt.strategy 的真实 secret 错配
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import { friendlyValidationMessage } from './common/validation-message';   // G140：校验错误中文化
import * as express from 'express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { currentAppEnvironment, isDevLoginAllowedEnvironment } from './auth/dev-login-policy';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const appEnv = currentAppEnvironment();
  // Keep this guard before Nest app creation so a bad production env fails closed.
  if (process.env.ENABLE_DEV_LOGIN === 'true' && !isDevLoginAllowedEnvironment()) {
    console.error(`[SEC-CRITICAL] ENABLE_DEV_LOGIN=true is forbidden in APP_ENV=${appEnv}.`);
    process.exit(1);
  }

  // ✅ bodyParser: false — 禁用 NestJS 内置的 100KB body-parser
  //    否则内置 parser 先于自定义中间件执行，logo base64 会触发 413
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // ── 静态文件：合同/单据上传目录 ───────────────────────────────────────────
  // Never expose /uploads as a public directory. Every file reference, including
  // Store Payment proof/QR files, must pass FileAccessService ACL first.
  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  console.warn('[SECURITY] /uploads static serving disabled. Use protected file endpoints.');

  // ── Body 大小限制（必须在所有中间件最前面注册）────────────────────────────
  // Logo base64 最大约 800KB（前端已限制），正文 JSON 预留至 5MB
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ limit: '5mb', extended: true }));

  // ── 反向代理信任（Docker / Nginx 链路下正确识别真实客户端 IP）──────────────
  // 不设置时 ThrottlerGuard 会把所有请求都归到同一个 IP bucket（Nginx 内网 IP），
  // 导致多用户共享 600/min 限额，触发误伤性 429
  if (isProd) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // ── CORS 配置 ────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:5180', 'http://127.0.0.1:5180'];

  app.enableCors({
    origin: isProd
      ? allowedOrigins         // 生产：白名单
      : true,                  // 开发：全部放行
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','X-User-Lang'],
  });

  // ── 安全响应头 ────────────────────────────────────────────────────────────────
  // 评分补强：关掉 Express 默认 X-Powered-By（泄露技术栈，给攻击者指纹）。
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // 不外泄 referer（含 token 的 URL 不随跳转外发）
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // ── 全局 ValidationPipe（class-validator 驱动，whitelist 剥离多余字段） ────────
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,          // 剥离 DTO 未声明的字段
    transform: true,          // 自动类型转换（@Type 装饰器生效）
    forbidNonWhitelisted: false, // 不因额外字段直接报错（宽松模式）
    transformOptions: { enableImplicitConversion: true },
    // G140：校验失败统一返回中文友好提示（取代 "amountOriginal must be a positive number" 这类生硬英文）
    exceptionFactory: (errors) => new BadRequestException(friendlyValidationMessage(errors)),
  }));

  // ── G5-A++ MenuRegistry hydrate（启动期从 sys_menu 加载 menu_code 注册表） ──
  try {
    const { DataSource } = await import('typeorm');
    const { hydrateMenuRegistry } = await import('./common/guards/menu-registry.service');
    const ds: InstanceType<typeof DataSource> = app.get(DataSource);
    await hydrateMenuRegistry(ds.manager);
    // G54：定期后台 reload（每 5min），让运行期新增菜单无需重启即被识别
    //   （根除 ar-ledger 那类"新菜单建好但内存注册表是启动快照→403"问题）。
    //   后台定时器，零请求热路径影响。
    setInterval(() => {
      hydrateMenuRegistry(ds.manager).catch(() => { /* 静默：下次再试 */ });
    }, 5 * 60 * 1000).unref();
  } catch (e) {
    console.warn('[MenuRegistry] hydrate skipped:', (e as Error).message);
  }

  // ── 启动 ─────────────────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT || '3100');
  await app.listen(port, '0.0.0.0');

  const modeTag = isProd ? '🚀 PRODUCTION' : '🛠️  DEV';
  console.log(`${modeTag} | Phoenix ERP V3 Backend → http://0.0.0.0:${port}`);
  if (!isProd) {
    console.log('  ⚠️  开发模式：跨域全放行，密码验证宽松，请勿暴露到公网');
  }
}
bootstrap();
