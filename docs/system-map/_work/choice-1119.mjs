// Records his budget choice of 19 Nov 2026 ("Live features first") in AUDIT-STATE.md. Run once from the repo root.
import fs from 'node:fs';
const p = 'docs/system-map/AUDIT-STATE.md';
let t = fs.readFileSync(p, 'utf8');
const swap = (a, b) => { if (!t.includes(a)) throw new Error('not found: ' + a.slice(0, 40)); t = t.replace(a, b); };
swap('he was asked on 19 Nov how to cut', 'HE CHOSE on 19 Nov: live features first (full journeys only for features with status live; the rest is deferred and listed in the final report)');
swap('HE WAS ASKED in this run\'s report (Needs you): full journeys for every feature, or only for live features with the rest deferred. Until he answers: go on with A5 for LIVE features on the panel and phone first, and lenses 4, 3, 5 beside it.',
  'HE ANSWERED on 19 Nov (in the chat, his words: "Live features first"): A5 writes full journeys ONLY for features with status live. Features with status behind switch, hidden or unknown get NO A5 item now: they are deferred, and the final report must list them as "not journeyed". So: make and add A5 items only for live features (panel and phone first, then web, server, hq, watch); a5-items.mjs must skip the other statuses before the next A5 launch (check its filter first; change only that filter). Lenses 4, 3, 5 run beside A5 as planned. Make the projection again after the item count is known.');
fs.writeFileSync(p, t);
console.log('ok');
