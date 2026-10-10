/**
 * ForgeAI config plugin: Android backup rules that carry the workout database (audit DS-01 / L-01).
 *
 * The committed android/ folder already has these settings. This plugin only matters if a
 * future `expo prebuild` regenerates android/: without it, expo-secure-store's own plugin would
 * point the manifest back at its rules, which back up shared preferences ONLY (no workouts).
 *
 * What it does on a prebuild:
 *  1. Copies forgeai_backup_rules.xml and forgeai_data_extraction_rules.xml (next to this file,
 *     the source of truth) into android/app/src/main/res/xml/.
 *  2. Points <application> android:fullBackupContent / android:dataExtractionRules at them and
 *     keeps android:allowBackup="true".
 *
 * app.json also passes `configureAndroidBackup: false` to expo-secure-store, so its plugin
 * does not fight this one whichever order they run in. The SecureStore exclusion it used to
 * add is kept inside our rules.
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const FILES = ['forgeai_backup_rules.xml', 'forgeai_data_extraction_rules.xml'];

function withBackupRules(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dest = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dest, { recursive: true });
      for (const f of FILES) fs.copyFileSync(path.join(__dirname, f), path.join(dest, f));
      return cfg;
    },
  ]);
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:allowBackup'] = 'true';
    app.$['android:fullBackupContent'] = '@xml/forgeai_backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/forgeai_data_extraction_rules';
    return cfg;
  });
  return config;
}

module.exports = withBackupRules;
