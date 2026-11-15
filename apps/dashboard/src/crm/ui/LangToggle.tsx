/**
 * The English | Hinglish switch (owner, 1 Nov 2026): two words side by side, the chosen one filled,
 * drawn like the Dark | Light switch. Kept on this device.
 * R-561 (owner, 15 Nov 2026: "the English and Hindi option for the admin panel should be available right beside the
 * light and dark mode"): in the top bar right beside Dark | Light on every page (it left Settings, so there is one
 * place), and on the sign-in page. `short` (a phone's top bar): "EN" and "HI", each still named English and Hinglish.
 */

import { setLang, t, useLang, type Lang } from '../lang/lang';
import { color, font, radius, TOUCH } from './kit';

/** Each option is written in its own language, so it can be found whichever is on. */
const OPTIONS: { lang: Lang; label: string; short: string }[] = [
  { lang: 'en', label: 'English', short: 'EN' },
  { lang: 'hinglish', label: 'Hinglish', short: 'HI' },
];

export function LangToggle({ compact = false, short = false }: { compact?: boolean; short?: boolean }) {
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
            aria-label={short ? o.label : undefined}
            title={short ? o.label : undefined}
            onClick={() => setLang(o.lang)}
            style={{
              appearance: 'none',
              border: 'none',
              cursor: on ? 'default' : 'pointer',
              minHeight: TOUCH - 4,
              padding: short ? 0 : compact ? '0 10px' : '0 14px',
              width: short ? 30 : undefined,
              borderRadius: radius.pill,
              background: on ? color.accentSoft : 'transparent',
              color: on ? color.accentBright : color.inkSecondary,
              fontFamily: font.body,
              fontSize: compact ? 13 : 14,
              fontWeight: on ? 700 : 500,
            }}
          >
            {short ? o.short : o.label}
          </button>
        );
      })}
    </div>
  );
}
