/**
 * Gym notices that pop up on the phone: the background job's definition. TaskManager needs a task
 * defined at the top level of a file the app's entry loads (index.js imports this one), so it
 * exists when Android wakes the app with no screen. Kept light: the work itself is loaded only
 * when the job runs (noticeAlertsRun.ts). Registered and unregistered by noticeTaskSync.ts.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const NOTICE_TASK = 'mettleup-gym-notices';

TaskManager.defineTask(NOTICE_TASK, async () => {
  try {
    const { runNoticeCheck } = await import('./noticeAlertsRun');
    return (await runNoticeCheck()) ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
  } catch (e) {
    console.warn('[ForgeErr] gym notices: the background job', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
