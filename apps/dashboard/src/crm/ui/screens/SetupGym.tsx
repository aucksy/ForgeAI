/**
 * R-526 (owner, 14 Nov 2026): "this getting started section is coming under the today section ... This should be a
 * separate section with something like set up your gym". The first steps of a new gym, on their own page (the owner's;
 * permissions.ts). Today keeps only today's numbers and to-dos.
 */
import { t } from '../../lang/lang';
import { GetStartedList } from '../GetStartedCard';
import { PageHeader } from '../kit';

export function SetupGymScreen() {
  return (
    <>
      <PageHeader title={t('Set up your gym')} subtitle={t('Finish these and your gym is ready for members.')} />
      <GetStartedList />
    </>
  );
}
