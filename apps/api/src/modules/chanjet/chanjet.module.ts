import { Module } from '@nestjs/common';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetCallbackController } from './chanjet-callback.controller';

@Module({
  controllers: [ChanjetCallbackController],
  providers: [ChanjetAuthService],
  exports: [ChanjetAuthService],
})
export class ChanjetModule {}
