/**
 * The English | Hinglish switch: two words side by side, the chosen one filled. In the panel's
 * top bar (phone), the sidebar (computer) and on the welcome screen. Each word is written in its
 * own language, so a person who reads only one of them can still find theirs.
 */

import { useLang, type Lang } from '../i18n';
import { color, font, radius, TOUCH } from './kit';

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'en', label: 'English' },
  { lang: 'hi', label: 'Hinglish' },
];

export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <div
      role="radiogroup"
      aria-label="Language / Bhasha"
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
            onClick={() => !on && setLang(o.lang)}
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
