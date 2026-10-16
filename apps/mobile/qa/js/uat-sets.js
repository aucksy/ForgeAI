// UAT-M helper (runScript): a routine page's sets line, copied with copyTextFrom ("4 sets · 5–8 reps",
// "1 warm-up · 3 sets · 8–12 reps · Rest 2:00"), to its count of working sets in output[KEY].
var t = String(maestro.copiedText || '');
var m = t.match(/(\d+) sets?\b/);
if (!m) throw new Error('uat-sets: no "N sets" in "' + t + '" (for ' + KEY + ')');
output[KEY] = parseInt(m[1], 10);
console.log('uat-sets: ' + KEY + ' = ' + output[KEY] + ' (from "' + t + '")');
