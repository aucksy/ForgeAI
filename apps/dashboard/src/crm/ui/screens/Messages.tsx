/**
 * Messages & offers (22 Oct 2026): the owner's own page for notices, offers and wishes to members,
 * moved out of Shop (R-offers-notices.md §6). `/messages/<ready message>` opens with that message
 * and its group picked — Today's nudges use it ("3 birthdays today" → Birthday wish). The old
 * address `/shop/messages` comes here (CrmApp.tsx). The page itself is shop/MessagesSection.tsx.
 *
 * #49 step 2 (23 Oct 2026): a switch at the top, Messages | Workout offer. `/messages/offer` is the
 * workout offer (shop/OffersSection.tsx); the front desk may open it (to give earned rewards with one
 * tap) but not the messages.
 *
 * R-86 (23 Oct 2026): a third section, Automatic reminders (shop/AutoRemindersSection.tsx), at
 * `/messages/reminders`. The owner switches them; the front desk may look.
 */

import { useCan } from '../../auth/AuthProvider';
import { MessagesSection } from '../../shop/MessagesSection';
import { AutoRemindersSection } from '../../shop/AutoRemindersSection';
import { OffersSection } from '../../shop/OffersSection';
import { ChipToggle, PageHeader, space } from '../kit';
import { navigate } from '../router';

export const OFFER_SECTION = 'offer';
export const REMINDERS_SECTION = 'reminders';

export function MessagesScreen({ startWith }: { startWith?: string }) {
  const owner = useCan()('manageGym');
  const reminders = startWith === REMINDERS_SECTION;
  // The front desk has no Messages section: anything else is the workout offer.
  const offer = startWith === OFFER_SECTION || (!owner && !reminders);
  const section = reminders ? 'reminders' : offer ? 'offer' : 'messages';
  const options = [
    ...(owner ? [{ value: 'messages', label: 'Messages' }] : []),
    { value: 'offer', label: 'Workout offer' },
    { value: 'reminders', label: 'Reminders' },
  ];
  return (
    <>
      <PageHeader
        title={owner ? 'Messages & offers' : reminders ? 'Automatic reminders' : 'Workout offer'}
        subtitle={
          owner
            ? 'Messages, offers and wishes for your members, in the app and on WhatsApp'
            : reminders
              ? 'What members get on their phone by themselves'
              : 'Rewards for members who train'
        }
      />
      <div style={{ marginBottom: space.lg }}>
        <ChipToggle
          label="Section"
          variant="tabs"
          value={section}
          onChange={(v) => navigate(v === 'offer' ? `/messages/${OFFER_SECTION}` : v === 'reminders' ? `/messages/${REMINDERS_SECTION}` : '/messages')}
          options={options}
        />
      </div>
      {/* A new address (a Today nudge) starts the page again with that message picked. */}
      {reminders ? <AutoRemindersSection /> : offer ? <OffersSection /> : <MessagesSection key={startWith ?? ''} startWith={startWith} />}
    </>
  );
}
