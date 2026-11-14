// UAT-M helper (runScript, part UK): the Today widget's spoken line, copied off the home screen with
// copyTextFrom, into output.routine ("Push Day A") and output.first ("Barbell Bench Press"), each with
// a regex-escaped twin (routineRe, firstRe) for the next steps. Read from the widget itself, never
// assumed. 0.72.0 (R-320): the widget says what to beat, R-499 words: "Workout: Push Day A. 6 exercises. Barbell
// Bench Press: previous 72.5 kg × 8 · next 75 × 5. Overhead Press: previous 40 kg × 8 · next 42.5 × 5.
// Start"; output.first is the first lift named there (the workout holds it, so set 1 is typed on it).
var t = String(maestro.copiedText || '');
var m = t.match(/^Workout: (.+?)\. \d+ exercises?\. (.+?): previous \d[\d.,]* (?:kg|lb)(?: each)? × \d+ · next .+\. Start$/);
if (!m) throw new Error('uat-widget: not a "Workout: <routine>. N exercises. <lift>: previous <kg> × <reps> · next ... Start" widget: "' + t + '"');
var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
output.routine = m[1];
output.routineRe = esc(m[1]);
output.first = m[2];
output.firstRe = esc(m[2]);
console.log('uat-widget: ' + output.routine + ' / first ' + output.first);
