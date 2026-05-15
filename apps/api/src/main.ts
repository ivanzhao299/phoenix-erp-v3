import 'dotenv/config';            // 必须在 AppModule 之前 — 否则 auth.service 文件级 const JWT_SECRET 在 ConfigModule 加载 .env 之前就取了 FALLBACK，与 jwt.strategy 的真实 secret 错配
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  // ✅ bodyParser: false — 禁用 NestJS 内置的 100KB body-parser
  //    否则内置 parser 先于自定义中间件执行，logo base64 会触发 413
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // ── Body 大小限制（必须在所有中间件最前面注册）────────────────────────────
  // Logo base64 最大约 800KB（前端已限制），正文 JSON 预留至 5MB
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ limit: '5mb', extended: true }));

  const isProd = process.env.NODE_ENV === 'production';

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
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

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
