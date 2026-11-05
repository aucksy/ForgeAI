// UAT-M helper (runScript, part UK): the Today widget's spoken line, copied off the home screen with
// copyTextFrom, into output.routine ("Push Day A") and output.first ("Barbell Bench Press"), each with
// a regex-escaped twin (routineRe, firstRe) for the next steps. Read from the widget itself, never
// assumed. 0.72.0 (R-320): the widget says what to beat, "Today: Push Day A. 6 exercises. Barbell
// Bench Press 72.5 kg × 8 last time · try 75 × 5. Overhead Press 40 kg × 8 last time · try 42.5 × 5.
// Start"; output.first is the first lift named there (the workout holds it, so set 1 is typed on it).
var t = String(maestro.copiedText || '');
var m = t.match(/^Today: (.+?)\. \d+ exercises?\. (.+?) \d[\d.,]* (?:kg|lb)(?: each)? × \d+ last time · try .+\. Start$/);
if (!m) throw new Error('uat-widget: not a "Today: <routine>. N exercises. <lift> <kg> × <reps> last time · try ... Start" widget: "' + t + '"');
var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
output.routine = m[1];
output.routineRe = esc(m[1]);
output.first = m[2];
output.firstRe = esc(m[2]);
console.log('uat-widget: ' + output.routine + ' / first ' + output.first);
