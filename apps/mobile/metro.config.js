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

module.exports = config;
