/**
 * What a Staff person sees on a page only an owner may open (an old link, or a typed address):
 * one plain sentence and a way back, instead of the page. permissions.ts says which pages.
 */

import { Button, Card, EmptyState } from '../ui/kit';
import { navigate } from '../ui/router';

export function OwnerOnly() {
  return (
    <Card>
      <EmptyState
        title={'Only an owner can see this'}
        body={'Ask your gym owner if you need something from here.'}
        action={<Button onClick={() => navigate('/')}>{'Back to Today'}</Button>}
      />
    </Card>
  );
}
