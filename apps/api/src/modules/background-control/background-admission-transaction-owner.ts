import { BackgroundTaskService } from './background-task.service';
import type { AdmissionTransactionOwner } from '../chanjet/chanjet-execution-admission.store';

/** Register before acquisition and retain the WHOLE manager promise. A manager
 * rejection cannot distinguish business rollback from failed rollback/release.
 * Unknown resource settlement permanently holds admission; never guess from an
 * error message, retry release, or clear the hold on a later OPEN manifest. */
export function backgroundAdmissionTransactionOwner(tasks: BackgroundTaskService): AdmissionTransactionOwner {
  return { run: start => tasks.run('chanjet-admission-transaction', 'CHANJET_SYNC', async () => {
    try { return await start(); }
    catch (error) { tasks.resourceHold(); throw error; }
  }) };
}
