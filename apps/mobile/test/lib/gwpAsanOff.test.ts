/**
 * Device QA run 38105636933: the app died at launch with SIGSEGV in
 * android_unsafe_frame_pointer_chase — Android 14's GWP-ASan sampler recording a stack trace
 * walked off Hermes' own stack. GWP-ASan stays off for ForgeAI: in the committed manifest AND in
 * the config plugin that would write it again on a prebuild.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '..', '..');

describe('GWP-ASan is off for ForgeAI', () => {
  it('in the committed AndroidManifest <application>', () => {
    const manifest = readFileSync(join(APP, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const app = manifest.slice(manifest.indexOf('<application'), manifest.indexOf('>', manifest.indexOf('<application')));
    expect(app).toContain('android:gwpAsanMode="never"');
  });
  it('in the config plugin', () => {
    const plugin = readFileSync(join(APP, 'plugins/backup-rules/withBackupRules.js'), 'utf8');
    expect(plugin).toMatch(/app\.\$\['android:gwpAsanMode'\] = 'never'/);
  });
});
