/**
 * Phoenix ERP V3 — UAT Module
 * Phase E: UAT & Pilot Run Runtime
 * Pilot Run 1 Execution Center: PilotRunDashboardController + PilotRunDashboardService
 */
import { Module } from '@nestjs/common';
import { UatFeedbackController }        from './controllers/uat-feedback.controller';
import { UatTrainingController }        from './controllers/uat-training.controller';
import { UatChecklistController }       from './controllers/uat-checklist.controller';
import { UatPilotRunController }        from './controllers/uat-pilot-run.controller';
import { UatReadinessController }       from './controllers/uat-readiness.controller';
import { PilotRunDashboardController }  from './controllers/pilot-run-dashboard.controller';
import { UatFeedbackService }           from './services/uat-feedback.service';
import { UatTrainingService }           from './services/uat-training.service';
import { UatChecklistService }          from './services/uat-checklist.service';
import { UatPilotRunService }           from './services/uat-pilot-run.service';
import { UatReadinessService }          from './services/uat-readiness.service';
import { PilotRunDashboardService }     from './services/pilot-run-dashboard.service';

@Module({
  controllers: [
    UatFeedbackController,
    UatTrainingController,
    UatChecklistController,
    UatPilotRunController,
    UatReadinessController,
    PilotRunDashboardController,
  ],
  providers: [
    UatFeedbackService,
    UatTrainingService,
    UatChecklistService,
    UatPilotRunService,
    UatReadinessService,
    PilotRunDashboardService,
  ],
})
export class UatModule {}
