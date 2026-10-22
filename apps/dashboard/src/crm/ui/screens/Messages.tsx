/**
 * Messages & offers (22 Oct 2026): the owner's own page for notices, offers and wishes to members,
 * moved out of Shop (R-offers-notices.md §6). `/messages/<ready message>` opens with that message
 * and its group picked — Today's nudges use it ("3 birthdays today" → Birthday wish). The old
 * address `/shop/messages` comes here (CrmApp.tsx). The page itself is shop/MessagesSection.tsx.
 */

import { MessagesSection } from '../../shop/MessagesSection';
import { PageHeader } from '../kit';

export function MessagesScreen({ startWith }: { startWith?: string }) {
  return (
    <>
      <PageHeader title="Messages & offers" subtitle="Notices, offers and wishes for your members, in the app and on WhatsApp" />
      {/* A new address (a Today nudge) starts the page again with that message picked. */}
      <MessagesSection key={startWith ?? ''} startWith={startWith} />
    </>
  );
}
