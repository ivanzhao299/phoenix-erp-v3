import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BugReportEntity } from './bug-report.entity';
import { BugIntakeController } from './bug-intake.controller';
import { BugIntakeService } from './bug-intake.service';

@Module({
  imports: [TypeOrmModule.forFeature([BugReportEntity])],
  controllers: [BugIntakeController],
  providers: [BugIntakeService],
})
export class BugIntakeModule {}
