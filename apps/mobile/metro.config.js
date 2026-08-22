// Metro config for the monorepo. npm workspaces hoists dependencies to the repo-root
// node_modules, so Metro must (1) WATCH the workspace root and (2) RESOLVE modules from
// both this app's node_modules and the hoisted root node_modules. Without this the bundler
// can't find hoisted packages. See https://docs.expo.dev/guides/monorepos/.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// expo-sqlite's web build imports `wa-sqlite.wasm` directly. Metro treats an
// unknown extension as source, so `expo start --web` dies with
// "Unable to resolve module ./wa-sqlite/wa-sqlite.wasm" even though the file is
// right there. Registering it as an asset is the documented fix and changes
// nothing for the native builds.
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

module.exports = config;
