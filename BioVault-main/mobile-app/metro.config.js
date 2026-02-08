const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration for monorepo structure
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [
    path.resolve(__dirname, '..'),  // Watch parent directory (monorepo root)
  ],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, '../node_modules'),  // Look in repo root for node_modules
      path.resolve(__dirname, 'node_modules'),      // Also check local
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
