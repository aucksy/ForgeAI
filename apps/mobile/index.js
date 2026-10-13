// The app's entry (package.json "main"). Gym branding: the gym's colours go into the theme
// tokens BEFORE any screen file loads, so even colours a file copies when it first loads are the
// gym's (src/theme/bootTheme.ts). Then expo-router starts the app as before.
import './src/theme/bootTheme';
import 'expo-router/entry';
