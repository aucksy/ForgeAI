/**
 * The home-screen widgets' native half (modules/forge-phone, Kotlin) is only ever built in the
 * cloud. These read its source so a slip the build would only find there is found here:
 *  - every view id Widgets.kt touches is declared in a widget layout (a missing one fails the
 *    cloud build; a renamed one would);
 *  - gym branding (D5): the widgets read the app's accent and tint the day marks with an image
 *    colour filter (works on every Android version), falling back to ForgeAI's orange;
 *  - a block comment never opens inside a KDoc (Kotlin block comments nest).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const MOD = resolve(__dirname, '../../modules/forge-phone/android/src/main');
const KT = readFileSync(join(MOD, 'java/com/forgeai/phone/Widgets.kt'), 'utf8');
const LAYOUTS = readdirSync(join(MOD, 'res/layout')).map((f) => readFileSync(join(MOD, 'res/layout', f), 'utf8')).join('\n');

describe('home-screen widgets (native source)', () => {
  it('every view id Widgets.kt uses is declared in a widget layout', () => {
    const used = [...new Set([...KT.matchAll(/R\.id\.(\w+)/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(10);
    const missing = used.filter((id) => !LAYOUTS.includes(`@+id/${id}"`));
    expect(missing).toEqual([]);
  });

  it("D5: the day marks and labels wear the app's accent, ForgeAI's orange when it is missing", () => {
    expect(KT).toMatch(/colourOf\(d, "accent", ACCENT\)/);
    expect(KT).toMatch(/colourOf\(d, "onAccent", INK\)/);
    expect(KT).toMatch(/"setColorFilter"/);
    for (const id of ['forge_today_label', 'forge_today_action', 'forge_week_label']) expect(KT).toContain(`setTextColor(R.id.${id}, accent)`);
    // Each mark is an image (tintable) under its letter.
    for (let i = 0; i < 7; i += 1) expect(LAYOUTS).toMatch(new RegExp(`<ImageView\\s+android:id="@\\+id/forge_week_m${i}"`));
  });

  it('no block comment opens inside a KDoc (Kotlin block comments nest)', () => {
    for (const doc of KT.match(/\/\*\*[\s\S]*?\*\//g) ?? []) expect(doc.slice(3).includes('/*'), doc.slice(0, 60)).toBe(false);
  });
});
