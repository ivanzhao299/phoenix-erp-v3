/**
 * TypeORM CLI DataSource — g195 P1（迁移工具标准化）
 *
 * 仅供 TypeORM CLI（migration:generate / migration:run / migration:revert / migration:show）使用。
 * 运行时连接由 apps/api/src/app.module.ts 的 TypeOrmModule.forRoot 负责，二者完全独立。
 *
 * 关键约定（见 docs/migration-tooling-roadmap.md）：
 *  - synchronize: false   —— 永远不让 TypeORM 自动改表
 *  - migrationsTableName: 'migrations'   —— 与历史 schema_migrations（裸 SQL tracking 表）分离
 *  - 迁移目录: apps/api/src/database/migrations  —— 顶级 apps/api/migrations/（172 个旧裸 SQL）已 baseline 冻结
 */

import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { resolve } from 'path';

const isCompiled = __filename.endsWith('.js');
const ext = isCompiled ? 'js' : 'ts';
const rootDir = isCompiled
  ? resolve(__dirname, '..', '..', 'dist')
  : resolve(__dirname, '..', '..', 'src');

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'mac',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'phoenix_erp',
  synchronize: false,
  migrationsTableName: 'migrations',
  entities: [`${rootDir}/**/*.entity.${ext}`],
  migrations: [`${rootDir}/database/migrations/*.${ext}`],
  migrationsRun: false,
};

export const AppDataSource = new DataSource(dataSourceOptions);
