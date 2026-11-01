/**
 * The English | Hinglish switch (owner, 1 Nov 2026): two words side by side, the chosen one filled,
 * drawn like the Dark | Light switch. On the sign-in page and in Settings. Kept on this device.
 */

import { setLang, t, useLang, type Lang } from '../lang/lang';
import { color, font, radius, TOUCH } from './kit';

/** Each option is written in its own language, so it can be found whichever is on. */
const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'en', label: 'English' },
  { lang: 'hinglish', label: 'Hinglish' },
];

export function LangToggle({ compact = false }: { compact?: boolean }) {
  const lang = useLang();
  return (
    <div
      role="radiogroup"
      aria-label={t('Language')}
      style={{
        display: 'inline-flex',
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.pill,
        padding: 2,
        gap: 2,
        flexShrink: 0,
      }}
    >
      {OPTIONS.map((o) => {
        const on = o.lang === lang;
        return (
          <button
            key={o.lang}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setLang(o.lang)}
            style={{
              appearance: 'none',
              border: 'none',
              cursor: on ? 'default' : 'pointer',
              minHeight: TOUCH - 4,
              padding: compact ? '0 10px' : '0 14px',
              borderRadius: radius.pill,
              background: on ? color.accentSoft : 'transparent',
              color: on ? color.accentBright : color.inkSecondary,
              fontFamily: font.body,
              fontSize: compact ? 13 : 14,
              fontWeight: on ? 700 : 500,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
