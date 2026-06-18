import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetCallbackController } from './chanjet-callback.controller';
import { SysChanjetStateEntity } from './sys-chanjet-state.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SysChanjetStateEntity])],
  controllers: [ChanjetCallbackController],
  providers: [ChanjetAuthService],
  exports: [ChanjetAuthService],
})
export class ChanjetModule {}
