// UAT-M helper (runScript): an exercise card's name, from its spoken label copied with copyTextFrom
// ("Barbell Bench Press. Open its history and how-to"), into output.ex, and output.exRe: the same
// name with regex characters escaped, for the set controls' labels ("<name> set 2 weight, ...").
var t = String(maestro.copiedText || '');
var i = t.indexOf('. Open its history and how-to');
if (i <= 0) throw new Error('uat-exname: not an exercise card label: "' + t + '"');
output.ex = t.substring(0, i);
output.exRe = output.ex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
console.log('uat-exname: ' + output.ex);
