/**
 * Phoenix ERP V3 — UAT Module
 * Phase E: UAT & Pilot Run Runtime
 */
import { Module } from '@nestjs/common';
import { UatFeedbackController }  from './controllers/uat-feedback.controller';
import { UatTrainingController }  from './controllers/uat-training.controller';
import { UatChecklistController } from './controllers/uat-checklist.controller';
import { UatPilotRunController }  from './controllers/uat-pilot-run.controller';
import { UatReadinessController } from './controllers/uat-readiness.controller';
import { UatFeedbackService }     from './services/uat-feedback.service';
import { UatTrainingService }     from './services/uat-training.service';
import { UatChecklistService }    from './services/uat-checklist.service';
import { UatPilotRunService }     from './services/uat-pilot-run.service';
import { UatReadinessService }    from './services/uat-readiness.service';

@Module({
  controllers: [
    UatFeedbackController,
    UatTrainingController,
    UatChecklistController,
    UatPilotRunController,
    UatReadinessController,
  ],
  providers: [
    UatFeedbackService,
    UatTrainingService,
    UatChecklistService,
    UatPilotRunService,
    UatReadinessService,
  ],
})
export class UatModule {}
