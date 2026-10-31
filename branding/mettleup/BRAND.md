# MettleUp brand sheet: logo E "Forged"

A hex dumbbell head, lit from above, with an M struck through it. *Mettle* began as a
spelling of *metal*.

Every file here is generated. Change `_src/brand.py` or `_src/make_assets.py`, then run
`python branding/mettleup/_src/make_assets.py` (about 3 minutes; `--fast` skips the store
screenshots). It needs `pip install resvg-py pillow fonttools`. The logo geometry comes from
`branding/logo-options/_src/build.py`, the generator the logo was picked from.

Preview of everything: `preview/contact-sheet.png`. Play listing mock: `store/listing-mock.png`.

## Colours

| Name | Hex | Role |
|---|---|---|
| Molten | `#FF8A4C` | top faces; orange accent words on dark |
| Forge | `#F0662A` | side faces; the brand orange; notification accent |
| Slag | `#C9481A` | bottom faces; orange text on white |
| Steel | `#1B1F26` | icon tile, splash, store backgrounds |
| Iron | `#E8EAEE` | "METTLE" in the dark wordmark |
| Ember | `#E0581F` | "UP" in the light wordmark (as the chosen file draws it) |
| Body grey | `#B9BFC8` | secondary text on Steel |

### Text pairings (WCAG 2 contrast, measured by `brand.contrast`)

AA needs 4.5:1 for body text and 3:1 for large text (24 px and up, or 19 px bold).

| Text on background | Ratio | Use it for |
|---|---|---|
| Steel on Forge | **5.23** | text on an orange button: **use Steel, not white** |
| White on Forge | 3.16 | large text only (24 px+). Never body text, never small labels |
| Steel on Molten | **7.08** | text on a light-orange chip |
| White on Molten | 2.34 | **fails**: never |
| White on Slag | **4.75** | white text on a dark-orange button: passes AA |
| Steel on Slag | 3.48 | large only |
| Molten on Steel | **7.08** | orange words on dark (store headlines use this) |
| Forge on Steel | **5.23** | orange body text on dark |
| Slag on Steel | 3.48 | large only (it is a shadow colour, not a text colour) |
| Iron on Steel | 13.72 | main text on dark |
| Body grey on Steel | 8.93 | secondary text on dark |
| Steel on white | 16.53 | main text on light |
| Slag on white | **4.75** | orange text on white |
| Ember on white | 3.76 | large only: fine for the wordmark's "UP", not for links |
| Forge on white | 3.16 | large only |
| Molten on white | 2.34 | **fails**: never as text on white |

Rule of thumb: on orange, write in Steel. On white, write orange in Slag. On Steel, Molten
and Forge both work.

## Type

- **Wordmark (owner pick, R-259, 31 Oct 2026)**: the "steel plate" letters: METTLEUP drawn from
  straight strokes, wide and heavy, small corner cuts at the hexagon's 30-degree angle, tight
  spacing. One source: `_src/steel_wordmark.py` (exact polygons). Big sizes (splash, hero) use the
  polished-steel fill, "UP" in orange metal; small sizes are flat: "METTLE" in Iron, "UP" in Forge.
  In use: the Android splash (mark over the name) and the app's lockup (Welcome screen, and top-right
  on the Workout, Progress and Gym tabs). Still on the older Manrope wordmark until switched: the
  website files in `web/`, the store pictures and the share pictures.
- **Store and marketing headlines**: Manrope ExtraBold, sentence case, -0.02 em, line height 1.04,
  max two lines, accent words in Molten.
- **Sub lines**: Manrope SemiBold.
- In the app the display face stays Sora: these rules are for the logo and the store.

## The mark

- Geometry: a pointy-top hexagon split into six triangles: two top faces Molten, two side
  faces Forge, two bottom faces Slag. The M is a 42-unit stroke on the 512 grid, knocked out
  (you see the background through it), sitting 11 units below the hex centre on purpose: an M's
  weight is at its top, so this is its optical centre.
- **Small-size M** (32 px and under: status bar, favicon 16/32, watch chip): a heavier M drawn
  on the 24 px grid, stems exactly 2 px on whole pixels, so the two gaps under the V stay open.
  Never scale the full-size mark down below 32 px; use the small one.
- **Clear space**: one quarter of the hex height on every side. Nothing else (text, edges, other
  logos) comes closer.
- **Minimum size**: full mark 32 px (on screen) / 8 mm (print). Small mark 16 px. Wordmark
  lockup: 20 px cap height on screen; below that use the mark alone.
- **Icon tile**: the hex's corners sit on a circle of 3/8 of the visible tile width (27 dp on
  Android's 72 dp visible area; 6 dp inside the 66 dp safe circle).

### Do
- Put it on Steel, on white, or on a photo darker than Steel.
- Use the single-colour version (`web/mark-mono.svg`, `currentColor`) where only one colour is
  possible: embossing, themed icons, watermarks.
- Keep the three faces in their order: lightest on top.

### Don't
- Don't recolour the faces, swap their order, or add a gradient, glow or outline to the mark.
- Don't fill the M: it is a cut, so the background shows through (painted Steel only where a
  format cannot cut, like Android vector drawables on a Steel tile).
- Don't rotate it: a flat-top hex is a different shape (a nut, not a dumbbell head).
- Don't set "MettleUp" in a font, or in mixed case, in a logo position: use the steel-plate letters.
- Don't put white text on Molten or Forge at body size.

## Files, sizes, and where each one goes

`install.py` copies all of these (dry run by default: `python branding/mettleup/install.py`,
then `--apply`). Paths on the right are from the repo root.

### Android phone app (`apps/mobile`)

| File here | Size | Goes to |
|---|---|---|
| `android/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_foreground.png` | 108, 162, 216, 324, 432 px | `android/app/src/main/res/mipmap-*/` |
| `.../ic_launcher_background.png` (solid Steel) | same | same |
| `.../ic_launcher_monochrome.png` (Android 13 themed icon) | same | same |
| `.../ic_launcher.png` (legacy square, Android 7) | 48, 72, 96, 144, 192 px | same |
| `.../ic_launcher_round.png` (legacy round) | 48, 72, 96, 144, 192 px | same |
| `android/res/mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml` | | same (unchanged wiring: background + foreground + monochrome) |
| `android/res/drawable-*/splashscreen_logo.png` (Android 12 splash, 288 dp canvas: mark over the steel name, inside the 192 dp circle; `make_assets.py --splash` makes only these) | 288, 432, 576, 864, 1152 px | `res/drawable-*/` |
| `android/res/drawable/notification_icon.xml` (vector status-bar icon) | 24 dp | `res/drawable/` (already wired in the manifest) |
| `android/expo/icon.png` (no alpha) | 1024 | `assets/images/icon.png` (app.json `icon`) |
| `android/expo/android-icon-foreground.png` | 1024 | `assets/images/` (app.json `android.adaptiveIcon.foregroundImage`) |
| `android/expo/android-icon-background.png` | 1024 | `assets/images/` (`backgroundImage`) |
| `android/expo/android-icon-monochrome.png` | 1024 | `assets/images/` (`monochromeImage`) |
| `android/expo/splash-icon.png` | 1024 | `assets/images/` (expo-splash-screen `android.image`) |
| `android/expo/notification-icon.png` (white on transparent) | 96 | `assets/images/` (expo-notifications `icon`, new) |
| `android/expo/favicon.png` | 48 | `assets/images/` (app.json `web.favicon`) |
| `android/notification/notification_icon-*.png` | 24, 36, 48, 72, 96 px | reference only: the vector above is what ships |
| `android/source/*.svg` | | the vector sources of the layers |

Config `install.py --apply` also edits:
- `app.json`: `android.adaptiveIcon.backgroundColor` -> `#1B1F26` (was `#E8692A`); expo-splash-screen
  `backgroundColor` -> `#1B1F26` (was `#07080C`), `imageWidth` -> `150` (was 96); expo-notifications
  `color` -> `#F0662A` (was `#FF7A3B`) and adds `"icon": "./assets/images/notification-icon.png"`.
- `android/app/src/main/res/values/colors.xml`: `splashscreen_background` and `iconBackground` ->
  `#1B1F26`, `notification_icon_color` -> `#F0662A`.

The splash is Steel so the launch animation grows out of the Steel icon tile without a colour
change; the app behind it is `#07080C`, a step darker. To make the splash match the app instead,
set both splash colours back to `#07080C`: the mark reads on either.

### Wear OS watch app (`apps/mobile/android/wear`)

| File here | Goes to |
|---|---|
| `android/wear/res/drawable/ic_launcher.xml` (round Steel tile, faceted mark, vector) | `src/main/res/drawable/ic_launcher.xml` |
| `android/wear/res/drawable/ic_stat_forge.xml` (white mark, small M, vector) | `src/main/res/drawable/ic_stat_forge.xml` |
| `android/wear/preview-ic_launcher-192.png` | preview only |

### Google Play (upload in Play Console)

| File | Size | Play's rule it meets |
|---|---|---|
| `store/play-icon-512.png` | 512x512, 32-bit PNG, opaque, full-bleed square | Play rounds the corners itself |
| `store/feature-graphic-1024x500.png` | 1024x500, 24-bit PNG, no alpha, 0.46 MB | under 1 MB; key content in the middle 80 % |
| `store/templates/shot-01..08.png` | 1080x1920, 24-bit PNG, no alpha | 9:16 portrait, 8 screenshots max |
| `store/templates/panorama-01-02-2160.png` | 2160x1920 | the joined pair before slicing (not uploaded) |
| `store/listing-mock.png` | review only | |

Screenshots: put real app screenshots in `store/raw/01.png` ... `08.png` (portrait; 1080x2400 is
ideal), edit `store/captions.json` if needed, run `python branding/mettleup/store/compose.py`,
upload `store/out/shot-*.png` in order. Shots 1 and 2 are one 2160 px artwork cut exactly at
1080, so they must stay first and second. Each slot's position is in `store/templates/slots.json`
and in the SVG as `<rect id="screen-slot-N">`.

### Owner web panel (`apps/dashboard/public`)

| File here | Size | Goes to |
|---|---|---|
| `web/favicon.svg` (small-M mark) | vector | `favicon.svg` (new; needs a `<link rel="icon" type="image/svg+xml">` in index.html) |
| `web/favicon.ico` | 16, 32, 48 (each drawn at its size) | `favicon.ico` (new) |
| `web/apple-touch-icon-180.png` | 180, no alpha | `brand/apple-touch-icon-180.png` |
| `web/icon-192.png`, `web/icon-512.png` (Steel rounded tile) | 192, 512 | `brand/` (manifest `any`) |
| `web/icon-maskable-512.png` (full bleed, mark inside the 80 % circle) | 512, no alpha | `brand/` (manifest `maskable`) |
| `web/og-1200x630.png` | 1200x630, no alpha | `brand/og-1200x630.png` (link previews) |
| `web/mark.svg` | vector | `brand/mark.svg` (keeps that file's own comment) |
| `web/wordmark-light.svg`, `web/wordmark-dark.svg` (lockup) | vector | `brand/` |
| `web/wordmark-text-*.svg`, `web/mark-mono.svg` | vector | spare: wordmark alone, one-colour mark |

The dashboard also has its own generator (`apps/dashboard/scripts/make-brand-assets.mjs`) that
renders `brand/*.png` from `brand/mark.svg`. Use one or the other; whichever runs last wins.

## Store words

Tagline: **Stronger every week.**

The 8 screenshot captions live in ONE place: `store/captions.json` (headline, sub line, and the screen
each one shows). Shots 1 and 2 are the panorama pair: one artwork across both (R-252). The pictures come from
the store-shots run named in its `_source` line. Never copy them here: a second list drifts.
