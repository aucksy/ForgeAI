// The app's entry (package.json "main"). Gym branding: the gym's colours go into the theme
// tokens BEFORE any screen file loads, so even colours a file copies when it first loads are the
// gym's (src/theme/bootTheme.ts). Then expo-router starts the app as before.
import './src/theme/bootTheme';
// #34 alerts: errors nothing caught are reported, with no personal data (src/lib/crashReport.ts).
import './src/lib/crashReport';
// The background job that pops up the gym's new notices: TaskManager needs it defined here, at the
// top level of the entry, so it exists when Android wakes the app with no screen.
import './src/shop/noticeTask';
import 'expo-router/entry';
