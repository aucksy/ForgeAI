/**
 * Third-party pictures and fonts the app ships, for the Credits page (Phase 0, EX-05).
 *
 * The exercise drawings are CC BY-SA 4.0: the licence asks for the creator, the licence, a
 * link to it, and a note that they were changed. Sources: docs/exercise-library/LICENSES.md
 * (drawings), src/tracker/catalog/bodyMapPaths.ts (body map), src/theme/fonts.ts (fonts, each
 * package's LICENSE_FONT). Add a line here whenever the app takes in someone else's work.
 */
import { BODY_MAP_LICENSE } from '@/tracker/catalog/bodyMapPaths';

export interface Credit {
  id: string;
  /** What it is in the app, e.g. "Exercise drawings". */
  what: string;
  /** Who made it. */
  author: string;
  /** Where it comes from. */
  source: string;
  sourceUrl: string;
  /** The licence spelled out in words. */
  licenceName: string;
  licenceUrl: string;
  /** What ForgeAI changed, if anything. */
  changes?: string;
  /** Licence text that must travel with the app. */
  fullText?: string;
}

export const CREDITS: readonly Credit[] = [
  {
    id: 'everkinetic',
    what: 'Exercise drawings',
    author: 'Greg Priday (Everkinetic)',
    source: 'Everkinetic open data',
    sourceUrl: 'https://github.com/everkinetic/data',
    licenceName: 'Creative Commons Attribution-ShareAlike 4.0 International',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    changes:
      'Recoloured to light lines for the dark screen and resized. The changed drawings are shared under the same licence.',
  },
  {
    id: 'body-map',
    what: 'Body map drawing',
    author: 'Hicham Elabbassi',
    source: 'react-native-body-highlighter 3.2.0',
    sourceUrl: 'https://www.npmjs.com/package/react-native-body-highlighter',
    licenceName: 'MIT License',
    licenceUrl: 'https://opensource.org/license/mit',
    changes: 'Split into ForgeAI’s own muscle areas.',
    fullText: BODY_MAP_LICENSE,
  },
  {
    id: 'fonts',
    what: 'Fonts: Manrope, Sora, Space Grotesk',
    author: 'The Manrope, Sora and Space Grotesk Project Authors',
    source: 'Google Fonts',
    sourceUrl: 'https://fonts.google.com',
    licenceName: 'SIL Open Font License 1.1',
    licenceUrl: 'https://openfontlicense.org',
  },
];
