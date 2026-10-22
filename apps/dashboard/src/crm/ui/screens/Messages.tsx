/**
 * Messages & offers (22 Oct 2026): the owner's own page for notices, offers and wishes to members,
 * moved out of Shop (R-offers-notices.md §6). `/messages/<ready message>` opens with that message
 * and its group picked — Today's nudges use it ("3 birthdays today" → Birthday wish). The old
 * address `/shop/messages` comes here (CrmApp.tsx). The page itself is shop/MessagesSection.tsx.
 *
 * #49 step 2 (23 Oct 2026): a switch at the top, Messages | Workout offer. `/messages/offer` is the
 * workout offer (shop/OffersSection.tsx); the front desk may open it (to give earned rewards with one
 * tap) but not the messages.
 */

import { useCan } from '../../auth/AuthProvider';
import { MessagesSection } from '../../shop/MessagesSection';
import { OffersSection } from '../../shop/OffersSection';
import { ChipToggle, PageHeader, space } from '../kit';
import { navigate } from '../router';

export const OFFER_SECTION = 'offer';

export function MessagesScreen({ startWith }: { startWith?: string }) {
  const owner = useCan()('manageGym');
  const offer = startWith === OFFER_SECTION;
  return (
    <>
      <PageHeader
        title={owner ? 'Messages & offers' : 'Workout offer'}
        subtitle={owner ? 'Notices, offers and wishes for your members, in the app and on WhatsApp' : 'Rewards for members who train'}
      />
      {owner && (
        <div style={{ marginBottom: space.lg }}>
          <ChipToggle
            label="Section"
            variant="tabs"
            value={offer ? 'offer' : 'messages'}
            onChange={(v) => navigate(v === 'offer' ? `/messages/${OFFER_SECTION}` : '/messages')}
            options={[
              { value: 'messages', label: 'Messages' },
              { value: 'offer', label: 'Workout offer' },
            ]}
          />
        </div>
      )}
      {/* A new address (a Today nudge) starts the page again with that message picked. */}
      {offer ? <OffersSection /> : <MessagesSection key={startWith ?? ''} startWith={startWith} />}
    </>
  );
}
