// UAT-M helper (runScript): the "Log a past workout" button just copied ("Log Sun, 6 Sep · 18:00", or
// "Log Sun, 6 Sep 2025 · 18:00" in another year) to the ways other screens write that day:
//   output.dayFull   "Sunday 6 September"  (Calendar's day label, before ", 1 workout")
//   output.monthName "September"           (Calendar's month heading, before " 2026 · N workouts")
//   output.pageDate  "Sunday, 6 Sep"       (the saved workout page, before " 2026 · 18:00")
// Read from the app's own words, never from this computer's clock (the phone can be in another
// time zone than the runner).
var t = String(maestro.copiedText || '');
var m = t.match(/^Log ([A-Z][a-z]{2}), (\d{1,2}) ([A-Z][a-z]{2})(?: \d{4})? · /);
if (!m) throw new Error('uat-day: not a "Log <day> · <time>" button: "' + t + '"');
var D = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
var M = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June',
  Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December'
};
if (!D[m[1]] || !M[m[3]]) throw new Error('uat-day: unknown day or month in "' + t + '"');
output.dayFull = D[m[1]] + ' ' + m[2] + ' ' + M[m[3]];
output.monthName = M[m[3]];
output.pageDate = D[m[1]] + ', ' + m[2] + ' ' + m[3];
console.log('uat-day: ' + output.dayFull + ' / ' + output.pageDate);
