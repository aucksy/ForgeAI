---
name: ForgeAI landing page (the tub label)
description: The /home/ landing page for gym owners, drawn as a supplement-tub label for "member retention".
colors:
  flavour: "#FF7A2E"
  on-flavour: "#1A0A02"
  sticker: "#FFD23F"
  sticker-ink: "#1C1600"
  record-gold: "#FFC53D"
  good: "#3ECF7A"
  tub: "#0B0B0D"
  tub-shelf: "#151518"
  tub-rule: "#2C2C33"
  ink: "#F4F4F2"
  ink-soft: "#C9C9CF"
  ink-quiet: "#9A9AA3"
  label: "#FFFFFF"
  label-ink: "#0B0B0D"
  label-ink-soft: "#3B3B42"
  app-bg: "#07080C"
  app-card: "#10131C"
  app-line: "#232937"
  app-ink: "#EEF0F4"
  app-ink-soft: "#9097A8"
typography:
  display:
    fontFamily: "Archivo, Khand, system-ui, sans-serif"
    fontSize: "clamp(3.6rem, 16vw, 6.6rem)"
    fontWeight: 900
    lineHeight: 0.88
    letterSpacing: "-0.01em"
    fontVariation: "\"wdth\" 62"
  headline:
    fontFamily: "Archivo, Khand, system-ui, sans-serif"
    fontSize: "clamp(3rem, 11vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.88
    letterSpacing: "-0.01em"
    fontVariation: "\"wdth\" 62"
  panel-title:
    fontFamily: "Archivo, Khand, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 9vw, 3.4rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.01em"
    fontVariation: "\"wdth\" 75"
  title:
    fontFamily: "Archivo, Mukta, system-ui, sans-serif"
    fontSize: "1.28rem"
    fontWeight: 800
    lineHeight: 1.2
  lede:
    fontFamily: "Archivo, Mukta, system-ui, sans-serif"
    fontSize: "clamp(1.05rem, 2.3vw, 1.22rem)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Archivo, Mukta, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Archivo, Mukta, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.14em"
  app-display:
    fontFamily: "Sora, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
  app-body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  focus: "4px"
  panel: "6px"
  form: "8px"
  callout: "10px"
  control: "14px"
  app-card: "18px"
  screen: "36px"
  phone: "44px"
  pill: "999px"
spacing:
  gutter: "16px"
  stack: "26px"
  grid-mobile: "36px"
  grid-desktop: "64px"
  section: "88px"
  section-loose: "96px"
  container: "1180px"
components:
  button-go:
    backgroundColor: "{colors.flavour}"
    textColor: "{colors.on-flavour}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "54px"
  button-go-on-label:
    backgroundColor: "{colors.label-ink}"
    textColor: "{colors.label}"
    rounded: "{rounded.control}"
    height: "54px"
  field:
    backgroundColor: "{colors.tub-shelf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "54px"
  field-on-label:
    backgroundColor: "{colors.label}"
    textColor: "{colors.label-ink}"
    rounded: "{rounded.control}"
    height: "54px"
  pill:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "44px"
  facts-panel:
    backgroundColor: "{colors.label}"
    textColor: "{colors.label-ink}"
    rounded: "{rounded.panel}"
    padding: "12px 14px 14px"
  flavour-band:
    backgroundColor: "{colors.flavour}"
    textColor: "{colors.on-flavour}"
    padding: "16px 0 14px"
  callout:
    backgroundColor: "{colors.label}"
    textColor: "{colors.label-ink}"
    rounded: "{rounded.callout}"
    padding: "7px 11px"
  price-tag:
    backgroundColor: "{colors.label}"
    textColor: "{colors.label-ink}"
    padding: "7px 14px 7px 9px"
  coming-chip:
    backgroundColor: "{colors.sticker}"
    textColor: "{colors.sticker-ink}"
    rounded: "5px"
    padding: "3px 8px"
  app-card:
    backgroundColor: "{colors.app-card}"
    textColor: "{colors.app-ink}"
    rounded: "{rounded.app-card}"
    padding: "12px"
---

# Design System: ForgeAI landing page (the tub label)

> **Scope.** This file documents the **landing-page world only**: `public/home/` (the static page served at `/home/`, with its script and its two screenshots). The admin web app in `src/` is **not** part of this world. It keeps its own dark theme from `@forgeai/theme` (near-black, orange #FF8A3D / #FFA043, Sora and Manrope). Nothing below applies to the admin app, and nothing in the admin theme overrides this page.

## Overview

**Creative North Star: "The Tub on the Shelf"**

The page sells ForgeAI the way a gym owner already sells his best product: as a supplement tub. The whole page reads as one tub label for "member retention". It has a matte black tub ground, a flavour band in the gym's own colour, a heavy condensed brand line, a black-on-white facts panel with thick and hairline rules, seal and burst stickers, and hand-placed call-outs and price tags on drawn leader lines that point at parts of the app. The member app appears as drawn phones whose screens follow the real app. The page does not use photos of phones or a product mock-up.

The page is dense the way packaging is dense: every block carries a fact, and there is no ornamental empty hero. Each section is a different panel of the tub, set by its colour field. The front is tub black, the facts sit on a darker shelf, the messages section is drenched in the flavour colour, and the form is the white back of the label. The flavour colour is live: the visitor picks a swatch and the band, the buttons, the app's accents and the messages section all repaint together.

Motion is percussive and scarce. Figures roll in digit by digit. One "New record" card slams in when the demo workout beats its target. Facts-panel rules draw in on scroll, and the headline presses back as the page scrolls. Every effect has a reduced-motion fallback.

**Key Characteristics:**
- Matte black tub ground with section panels set by colour field (tub, shelf, flavour, white label).
- Heavy condensed caps (Archivo 900 at 62% width) for every heading; plain Archivo for reading.
- A facts panel built from black rules of three weights: 12px, 5px and 1px hairline.
- One live flavour colour, chosen by the visitor, that every accent follows.
- Stickers, call-outs and price tags sit slightly tilted, like things stuck on by hand.
- Drawn phones show the member app in its own type (Sora and Manrope) on its own dark palette.

## Colors

A black tub, one loud flavour colour that the visitor owns, a sticker yellow, and a white label. The drawn phone screens carry a separate, cooler app palette.

### Primary
- **Flavour Orange** (flavour): the gym's own colour. ForgeAI orange is the default, and the visitor can swap it for red, yellow, green, blue or purple. It fills the flavour band, the main buttons, the step numbers, the money figures, the messages section, text selection, the focus ring and every accent inside the drawn app. It repaints with a 0.5s transition.
- **Flavour Ink** (on-flavour): the text colour on the flavour colour. Each swatch brings its own paired ink (dark on orange, yellow and green; white on red, blue and purple), and both values are set together.

### Secondary
- **Sticker Yellow** (sticker) with **Sticker Ink** (sticker-ink): used only for the small "Coming" chip that marks planned features.

### Tertiary
- **Record Gold** (record-gold): the "New record" slam card and low-stock notes inside the drawn app.
- **Done Green** (good): ticked sets, success messages and the beaten-target state.

### Neutral
- **Tub Black** (tub): the page ground and the label's black ink.
- **Shelf Black** (tub-shelf): the facts section ground and the dark form fields.
- **Tub Rule** (tub-rule): hairline section dividers and pill borders on black.
- **Chalk** (ink), **Soft Chalk** (ink-soft), **Quiet Chalk** (ink-quiet): headline, lede and small print on black.
- **Label White** (label), **Label Ink** (label-ink), **Label Grey** (label-ink-soft): the facts panels, call-outs, price tags and the back of the label.
- **App palette** (app-bg, app-card, app-line, app-ink, app-ink-soft): only inside drawn phone screens. It mirrors the member app and is never used for page chrome.

### Named Rules
**The One Flavour Rule.** There is exactly one accent hue on the page, and it belongs to the gym. Anything that says "yours" (band, buttons, step numbers, the app's highlights) reads the flavour variable and never a fixed orange.

**The Paired Ink Rule.** The flavour colour never ships without its own ink. A new swatch must give both values, chosen for contrast on that colour.

**The Colour Field Rule.** Sections are told apart by their ground (tub, shelf, flavour, white label), not by extra boxes or borders.

## Typography

**Display Font:** Archivo variable, 900 weight, width 62–75 (Khand 700 for Hindi)
**Body Font:** Archivo 400–800 (Mukta for Hindi, at line height 1.7)
**In-app Fonts:** Sora (display) and Manrope (body), used only inside drawn phone screens

**Character:** A packaging grotesk. The condensed black caps shout the claim the way a tub shouts its protein count, and plain Archivo reads like the small print on the back.

### Hierarchy
- **Display:** the brand line ("Keeps members coming back."). Uppercase, width 62. On wide screens it caps at clamp(4rem, 6.4vw, 5.9rem). Hindi drops to clamp(3rem, 13vw, 5.6rem), not uppercased, line height 1.02.
- **Statement of identity:** what the product is, directly UNDER the display line ("Gym software + member progress app"; owner R-54, 22 Oct 2026). Condensed caps at clamp(1.3rem, 5.6vw, 2rem), between a 3px ink rule and a hairline, like a tub's product-type line; the "+" takes the flavour colour. Never above the display line (no kicker), and the same words lead the page title and the link preview.
- **Headline:** every section heading. Uppercase condensed, width 62.
- **Panel title:** the facts-panel heading, at width 75.
- **Title:** step headings in "Directions for use".
- **Lede / Body:** section intros capped at 52ch; body at 17px/1.55. Desk-work prose is capped at 62ch.
- **Label:** the band's input label and the spec strip under the claim. Uppercase, tracked 0.14–0.16em. Hindi removes the tracking and goes up to 13–14px.
- **Condensed figures:** prices, money lines, step and list numbers use the condensed face at width 62–75 with tabular figures where numbers roll.

### Named Rules
**The Hindi Swap Rule.** Every condensed or tracked style has a Hindi branch. Use Khand in place of condensed Archivo and Mukta for text, with no uppercase, no letter-spacing, and a slightly larger size.

**The Two Typefaces, Two Worlds Rule.** Archivo belongs to the label. Sora and Manrope appear only inside the drawn app screens, because they are the app's own fonts.

## Layout

Single column on phones. At 980px and wider, sections become two-column grids with 56–64px gaps. The container is min(1180px, 100% − 32px). On desktop the hero lockup hugs the left edge at max(16px, (100vw − 1180px)/2), and the hero phone pins to the right edge. The flavour band runs full bleed and reserves 420px on the right for the phone. Section padding is 80–96px top and 80–88px bottom. The sticky lid is 58px tall, made of frosted tub black with a hairline under it. Stacks inside sections step at 14, 22 and 26px. On phones the hero phone drops below the band, and the workout call-outs wrap as a centred row under the phone. On desktop they stand in a 170px column beside it, joined by leader lines.

## Elevation & Depth

Depth is physical, as if objects sit on a shelf. It is not interface layering. Phones cast long, soft drop shadows. White panels, call-outs, tags and stickers cast short dark shadows, as paper stuck on a surface would. Nothing uses a hard offset shadow. The lid uses backdrop blur.

### Shadow Vocabulary
- **Phone** (`0 0 0 1px #34343C, 0 44px 70px -26px rgba(0,0,0,.85), 0 14px 30px rgba(0,0,0,.5)`): drawn phones on black.
- **Phone on flavour** (`0 0 0 1px rgba(0,0,0,.4), 0 40px 70px -24px rgba(0,0,0,.6)`): drawn phones on the flavour section.
- **Label panel** (`0 30px 60px -20px rgba(0,0,0,.6)`): facts and evidence panels.
- **Stuck paper** (`0 8px 18px rgba(0,0,0,.35)` for call-outs, `0 10px 20px rgba(0,0,0,.4)` for price tags): hand-placed notes.
- **Sticker** (`drop-shadow(0 8px 14px rgba(0,0,0,.4))`): the seal and burst SVGs.

### Named Rules
**The Stuck-On Rule.** Things laid on the label (call-outs, tags, stickers, panels, the "Coming" chip) tilt between −5° and 12° and cast a soft shadow. The page's own text and sections never tilt.

## Shapes

The label itself is square-ish, with small 6–8px corners on panels and the form, and thick black borders (3px). Controls are soft (14px). Pills are fully round. The drawn phones are 44px slabs with 36px screens. Price tags are asymmetric (6px 20px 20px 6px) with a punched hole. Stickers are authored SVG outlines: a scalloped seal and a spiked burst. Step numbers sit in flavour circles. Leader lines are 1.6px round-capped strokes that end in a dot.

## Components

### Buttons
- **Go (primary):** 54px tall, 14px corners, flavour fill with flavour ink, condensed uppercase 19px at width 75. Hover brightens it 8%, press scales it to 0.97, and the disabled state drops to 0.6 opacity. On the white back of the label it inverts to label ink with white text at 21px.
- **Pill (secondary):** 44px, fully round, hairline tub-rule border, soft chalk text. Hover lifts the border and the text. Used for the language switch and "Replay".

### Inputs / Fields
- **Style:** 54px, 14px corners, shelf-black fill with a 1px #3A3A42 border and 600 18px text. On the white label: white fill with a 2px label-ink border.
- **Focus:** the border turns flavour, with a 3px flavour halo at 35%. The global focus ring is a 3px flavour outline, offset 3px.
- **Band input:** borderless, with a 2px dashed underline in the flavour ink that turns solid on focus. It is typed in display-condensed caps at clamp(2.1rem, 9vw, 4rem).

### Flavour Band (signature)
A full-bleed strip in the flavour colour, with 3px label-ink rules above and below. It holds the gym-name input and six 44px round swatches. The selected swatch scales to 1.12 inside a double ring.

### Facts Panel (signature)
A white label with a 3px black border, 6px corners, and a heavy condensed title. A 12px rule closes the header rows, a 5px rule sits under the column heads, each line has a 1px hairline, and a 12px rule plus a 5px rule frame the cost and footnote. Panels tilt slightly (−1.2° or 0.8°), and their rules draw in on scroll where supported. Planned items carry the yellow "Coming" chip.

### Call-outs and Leader Lines (signature)
White notes, 14px/800, at most 15ch wide, tilted −2° (or 1.5° on even ones). Each one names a part of a drawn phone screen, and a script-drawn line joins the note to that part. The line ends in a dot and never crosses the content it names.

### Price Tags (signature)
White hang-tags in condensed 21px figures with a small "your price" note. Their leader lines are white, and they tilt −5° and 4°.

### Stickers (signature)
The seal (88px, or 124px on desktop) and the burst (92px or 106px) are authored SVG shapes with condensed label-ink text. They sit on the frame around a phone, never over its screen content.

### Drawn Phones (signature)
A 300px phone (330px in the hero on desktop, 280px for the shop) at 9:19, sometimes tilted 3°. Its screen uses the app palette and app fonts: cards with 18px corners, a set table with a ticked done state, a rest bar filled in flavour, a tab bar with the flavour active tab, and a gold "New record" card that slams in once.

### Desk Screenshots
Real admin-app screenshots, cropped, with 18px corners, a 1px tub-rule border and a 14px caption. Each raster carries a provenance sidecar describing where it came from.

## Do's and Don'ts

### Do:
- **Do** route every "yours" accent through the flavour colour and its paired ink, and repaint it with the 0.5s ease (cubic-bezier(.16,1,.3,1)).
- **Do** set section headings in condensed Archivo 900 caps, and give every condensed or tracked style a Hindi branch (Khand or Mukta, no caps, no tracking).
- **Do** build facts as a label panel with 12px, 5px and 1px black rules, and mark anything planned with the yellow "Coming" chip.
- **Do** point at the app with a call-out on a leader line, and keep the note and its line off the content it names.
- **Do** label demo data as an example in small print (13px quiet chalk) beside the screen it describes.
- **Do** keep stickers on a phone's frame or its margin, not over its screen.

### Don't:
- **Don't** use the label's fonts or colours inside a drawn phone screen, or the app palette for page chrome.
- **Don't** ship a swatch without its paired ink.
- **Don't** tilt the page's own text or sections. Only stuck-on objects tilt.
- **Don't** use a hard offset shadow. Depth here is a soft cast shadow.
- **Don't** add a tracked uppercase line above a heading. The heading is the first thing in each section.
- **Don't** set readable page text below 12px. Type smaller than that belongs only inside drawn app screens, which follow the app's own sizes.
