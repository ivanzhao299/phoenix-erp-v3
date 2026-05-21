import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { MenuGuard } from './common/guards/menu.guard';
import { StoreCodeInterceptor } from './common/interceptors/store-code.interceptor';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { AuthExceptionFilter } from './common/filters/auth-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtStrategy } from './auth/jwt.strategy';
import { AuthModule } from './auth/auth.module';

// P1 Modules
import { FarmModule } from './modules/farm/farm.module';
import { OrderModule } from './modules/order/order.module';
import { StoreModule } from './modules/store/store.module';

// P2 Modules
import { ApprovalModule } from './modules/approval/approval.module';
import { FinanceModule } from './modules/finance/finance.module';
import { DebugController } from './debug.controller';
import { HealthController } from './health.controller';
import { WmsModule } from './modules/wms/wms.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { GenericCrudModule } from './modules/generic-crud/generic-crud.module';
import { MasterModule } from './modules/master/master.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { IotModule } from './modules/iot/iot.module';
import { BffModule } from './modules/bff/bff.module';
// [V3 RBAC 完善] 角色权限矩阵专用模块
import { PermissionsModule } from './modules/permissions/permissions.module';
import { QualityModule } from './modules/quality/quality.module';
import { WorkflowModule } from './modules/workflow/workflow.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 速率限制：仅在生产环境启用；开发环境 skipIf 直接放行，避免 React Strict Mode
    // 双重挂载 + 多标签页并发把 127.0.0.1 同一 bucket 打满触发 blockDuration 死锁
    ThrottlerModule.forRoot({
      skipIf: () => process.env.NODE_ENV !== 'production',
      throttlers: [
        { name: 'global', ttl: 60_000, limit: 1500 },
        { name: 'login',  ttl: 900_000, limit: 10 },
      ],
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'mac',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'phoenix_erp',
      autoLoadEntities: true,
      synchronize: false, // 严格使用 DDL，禁用同步
    }),
    ScheduleModule.forRoot(),
    GenericCrudModule,
    MasterModule,
    FarmModule,
    OrderModule,
    StoreModule,
    ApprovalModule,
    FinanceModule,
    WmsModule,
    LogisticsModule,
    ProcurementModule,
    AuthModule,
    TerminalModule,
    IotModule,
    BffModule,
    PermissionsModule,
    QualityModule,
    WorkflowModule,
  ],
  controllers: [DebugController, HealthController],
  providers: [
    JwtStrategy,
    // 全局速率限制 Guard
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 全局挂载拦截器
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    StoreCodeInterceptor,
    // 统一 401 响应结构（注入 subcode）— 先注册，优先处理 UnauthorizedException
    { provide: APP_FILTER, useClass: AuthExceptionFilter },
    // 全局兜底：屏蔽堆栈、映射 PG 错误码、统一 500 响应
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
