/**
 * What a Staff person sees on a page only an owner may open (an old link, or a typed address):
 * one plain sentence and a way back, instead of the page. permissions.ts says which pages.
 */

import { tr } from '../i18n';
import { Button, Card, EmptyState } from '../ui/kit';
import { navigate } from '../ui/router';

export function OwnerOnly() {
  return (
    <Card>
      <EmptyState
        title={tr('Only an owner can see this', 'Yeh sirf Owner dekh sakta hai')}
        body={tr('Ask your gym owner if you need something from here.', 'Yahan se kuch chahiye to Gym Owner se poochho.')}
        action={<Button onClick={() => navigate('/')}>{tr('Back to Today', 'Aaj par wapas')}</Button>}
      />
    </Card>
  );
}
