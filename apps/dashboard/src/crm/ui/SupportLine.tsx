/**
 * Launch audit 3 Nov 2026 (ops #4, owner side #7): a paused gym was told "Call MettleUp" with no
 * number, and a locked-out owner had no way to reach anyone from the sign-in screen. Every such
 * place now shows MettleUp's support email. A phone number waits for the owner's yes.
 */
import { SUPPORT_EMAIL } from '../auth/signin';
import { t } from '../lang/lang';
import { color, font, space } from './kit';

export function SupportLine({ center = false }: { center?: boolean }) {
  return (
    <p
      style={{
        margin: `${space.lg}px 0 0`,
        fontFamily: font.body,
        fontSize: 13,
        color: color.inkSecondary,
        textAlign: center ? 'center' : undefined,
      }}
    >
      {t('Need help? Email MettleUp at')}{' '}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        style={{ color: color.accentBright, fontWeight: 700, display: 'inline-block', minHeight: 24, overflowWrap: 'anywhere' }}
      >
        {SUPPORT_EMAIL}
      </a>
    </p>
  );
}
