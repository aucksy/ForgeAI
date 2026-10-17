// UAT-M helper (runScript, part UK): the Today widget's spoken line, copied off the home screen with
// copyTextFrom ("Today: Push Day A. 6 exercises · Barbell Bench Press first. Start"), into
// output.routine ("Push Day A") and output.first ("Barbell Bench Press"), each with a regex-escaped
// twin (routineRe, firstRe) for the next steps. Read from the widget itself, never assumed.
var t = String(maestro.copiedText || '');
var m = t.match(/^Today: (.+?)\. \d+ exercises? · (.+) first\. Start$/);
if (!m) throw new Error('uat-widget: not a "Today: <routine>. N exercises · <first> first. Start" widget: "' + t + '"');
var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
output.routine = m[1];
output.routineRe = esc(m[1]);
output.first = m[2];
output.firstRe = esc(m[2]);
console.log('uat-widget: ' + output.routine + ' / first ' + output.first);
