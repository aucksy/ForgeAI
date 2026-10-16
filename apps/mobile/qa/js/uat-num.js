// UAT-M helper (runScript): the LAST number in the text just copied (copyTextFrom) into
// output[KEY], as a number. "Workouts: 75" -> 75; "September 2026 · 21 workouts" -> 21 (the count,
// never the year); "1,240" -> 1240. Called with env KEY (the output name). A text with no number
// fails the flow here, by name, instead of comparing against NaN later.
var t = String(maestro.copiedText || '');
var m = t.match(/(\d[\d,]*)\D*$/);
if (!m) throw new Error('uat-num: no number in "' + t + '" (for ' + KEY + ')');
output[KEY] = parseInt(m[1].replace(/,/g, ''), 10);
console.log('uat-num: ' + KEY + ' = ' + output[KEY] + ' (from "' + t + '")');
