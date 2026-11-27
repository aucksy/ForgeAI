/**
 * R-630 slice A, design note section 3a: the sheet before an age under 18 is saved, and what "Delete and continue"
 * starts. Shared by onboarding, Settings -> Profile and the first open after the update (3b). Words need the owner's
 * yes before release (R-630 HIM question 3).
 */
import { askConfirm } from '@/components/ui/confirmStore';
import { useGymShop } from '@/shop/gymStore';

export const UNDER18_SHEET = {
  title: 'MettleUp is for people 18 and older',
  body:
    'If you are under 18, MettleUp deletes everything it keeps about you on its server, and your workouts stay only on this phone.',
  confirmLabel: 'Delete and continue',
  cancelLabel: 'Cancel',
} as const;

/** Ask the member. true = "Delete and continue". */
export function askUnder18(): Promise<boolean> {
  return askConfirm({ ...UNDER18_SHEET, destructive: true });
}

/** After "Delete and continue" and the age is saved: start the delete job. Never throws. */
export async function afterUnder18Confirmed(): Promise<void> {
  try {
    const { startUnder18Delete } = await import('./under18Run');
    await startUnder18Delete(useGymShop.getState().link ?? null);
  } catch (e) {
    console.warn('[under18] could not start the delete', e);
  }
}

/**
 * At every app open (root layout). A delete job not finished: try it again. No job but a stored age under 18
 * (typed before this update, or brought back by a restore): the same sheet (design note 3b). Cancel opens the age
 * to fix it; nothing is deleted. Until the member answers, nothing uploads (profileUnder18 stops every upload).
 */
export async function startUnder18Check(): Promise<void> {
  try {
    const { readUnder18Job, runUnder18Job } = await import('./under18Run');
    const link = useGymShop.getState().link ?? null;
    const job = await readUnder18Job();
    if (job) {
      if (job.gym === 'todo' || job.account === 'todo') await runUnder18Job(link);
      return;
    }
    const { profileUnder18 } = await import('./copySync');
    if (!(await profileUnder18())) return;
    if (await askUnder18()) await afterUnder18Confirmed();
    else {
      const { router } = await import('expo-router');
      router.push('/edit-profile');
    }
  } catch (e) {
    console.warn('[under18] start-up check failed', e);
  }
}
