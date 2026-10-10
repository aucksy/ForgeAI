// Audit Phase 7 (SH-21): one text-size policy for every screen.
//
// React Native's `import { Text, TextInput } from 'react-native'` is served by two lines in
// react-native/index.js:  require('./Libraries/Text/Text')  and
// require('./Libraries/Components/TextInput/TextInput'). This points THOSE TWO requests — and
// only when they come from react-native's own index.js — at the app's capped versions in
// src/components/ui/scaledText.tsx. The capped versions import the real files directly, so
// they are never redirected themselves. React Native's internal pieces (Button, etc.) keep
// importing the real files.
const path = require('path');

const ENTRIES = {
  './Libraries/Text/Text': 'src/components/ui/scaledText.tsx',
  './Libraries/Components/TextInput/TextInput': 'src/components/ui/scaledTextInput.ts',
};

/** True when `origin` is react-native's own index.js (any install location, any slash). */
function isReactNativeIndex(origin) {
  if (typeof origin !== 'string') return false;
  return /[\\/]node_modules[\\/]react-native[\\/]index\.js$/.test(origin);
}

/** The app file to use instead, or null to resolve normally. */
function textScaleTarget(projectRoot, originModulePath, moduleName) {
  if (!isReactNativeIndex(originModulePath)) return null;
  const rel = ENTRIES[moduleName];
  return rel ? path.join(projectRoot, rel) : null;
}

/** Wraps Metro's resolveRequest with the redirect. */
function withTextScale(projectRoot, upstream) {
  return (context, moduleName, platform) => {
    const target = platform === 'web' ? null : textScaleTarget(projectRoot, context.originModulePath, moduleName);
    if (target) return { type: 'sourceFile', filePath: target };
    return (upstream ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = { textScaleTarget, withTextScale, ENTRIES };
