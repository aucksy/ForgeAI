/**
 * F201: /assistant, the AI Assistant on its own page: full screen on a phone (the floating button opens it), and a
 * plain page on a computer (the menu's "AI Assistant" under Today). Owner only (permissions.ts). Until the gym's
 * server answers the wallet (supabase 0071), or when the panel worker says the assistant is off, the page is not
 * there: the address goes back to Today.
 */
import { AssistantHome } from '../../assistant/ui/AssistantHome';
import { useAssistant } from '../../assistant/useAssistant';
import { Redirect } from '../router';

export function AssistantScreen() {
  const { on, key, wallet, waiting } = useAssistant();
  // Opened straight from an address: the first answer from the server is a moment away.
  if (waiting) return null;
  if (!on || !key || !wallet) return <Redirect to="/" />;
  return <AssistantHome assistKey={key} wallet={wallet} />;
}
