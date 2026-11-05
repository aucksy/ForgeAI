import { describe, expect, it } from 'vitest';

import { isNewer, phoneApkName, readReleaseNews, releaseUpdate, updateToShow, versionParts, WHATS_NEW_URL } from '@/lib/appUpdate';

describe('appUpdate (launch C6)', () => {
  it('reads plain versions only', () => {
    expect(versionParts('v0.49.0')).toEqual([0, 49, 0]);
    expect(versionParts('0.48.12')).toEqual([0, 48, 12]);
    expect(versionParts('v0.49.0-rc1')).toBeNull();
    expect(versionParts(undefined)).toBeNull();
  });

  it('compares by number, not by text', () => {
    expect(isNewer('v0.49.0', '0.48.0')).toBe(true);
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('v0.48.0', '0.48.0')).toBe(false);
    expect(isNewer('v0.47.3', '0.48.0')).toBe(false);
    expect(isNewer('v1.0.0', 'nonsense')).toBe(false);
  });

  it('picks the phone APK, never the watch APK', () => {
    const release = {
      tag_name: 'v0.57.0',
      assets: [
        { name: 'forgeai-v0.57.0-wear.apk', browser_download_url: 'https://github.com/aucksy/ForgeAI/releases/download/v0.57.0/forgeai-v0.57.0-wear.apk' },
        { name: 'mettleup-v0.57.0.apk', browser_download_url: 'https://github.com/aucksy/ForgeAI/releases/download/v0.57.0/mettleup-v0.57.0.apk' },
      ],
    };
    expect(releaseUpdate(release)).toEqual({
      version: '0.57.0',
      url: 'https://github.com/aucksy/ForgeAI/releases/download/v0.57.0/mettleup-v0.57.0.apk',
    });
  });

  it('looks for the MettleUp file name, never an old ForgeAI one (another app on the phone)', () => {
    expect(phoneApkName('v0.57.0')).toBe('mettleup-v0.57.0.apk');
    // A ForgeAI-era release (com.forgeai.app) is a different app: never offered as an update.
    const old = { tag_name: 'v0.55.0', assets: [{ name: 'forgeai-v0.55.0.apk', browser_download_url: 'https://github.com/aucksy/ForgeAI/releases/download/v0.55.0/forgeai-v0.55.0.apk' }] };
    expect(releaseUpdate(old)).toBeNull();
  });

  it('offers nothing without a phone APK or with a link off GitHub', () => {
    expect(releaseUpdate({ tag_name: 'v0.57.0', assets: [] })).toBeNull();
    expect(releaseUpdate({ tag_name: 'v0.57.0', assets: [{ name: 'mettleup-v0.57.0.apk', browser_download_url: 'https://evil.example/x.apk' }] })).toBeNull();
    expect(releaseUpdate({ tag_name: 'test-lab-1', assets: [] })).toBeNull();
  });

  it('"Later" hides only that version', () => {
    const u = { version: '0.49.0', url: 'https://github.com/x.apk' };
    expect(updateToShow(u, '0.48.0', null)).toEqual(u);
    expect(updateToShow(u, '0.48.0', '0.49.0')).toBeNull();
    expect(updateToShow({ ...u, version: '0.50.0' }, '0.48.0', '0.49.0')).not.toBeNull();
    expect(updateToShow(u, '0.49.0', null)).toBeNull();
    expect(updateToShow(null, '0.48.0', null)).toBeNull();
  });
});

describe('R-336: whats-new.json of the newest release', () => {
  it('is a plain file download (no API rate limit)', () => {
    expect(WHATS_NEW_URL).toBe('https://github.com/aucksy/ForgeAI/releases/latest/download/whats-new.json');
  });
  it('reads a version and up to 3 short, non-empty lines', () => {
    expect(readReleaseNews({ version: '0.73.0', lines: ['  One.  ', '', 'Two.', 7, 'Three.', 'Four.'] })).toEqual({
      version: '0.73.0',
      lines: ['One.', 'Two.', 'Three.'],
    });
    expect(readReleaseNews({ version: 'v0.73.0', lines: [] })).toEqual({ version: '0.73.0', lines: [] });
    expect(readReleaseNews({ version: '0.73.0', lines: ['x'.repeat(241)] })?.lines).toEqual([]);
  });
  it('anything else reads as nothing', () => {
    expect(readReleaseNews(null)).toBeNull();
    expect(readReleaseNews('0.73.0')).toBeNull();
    expect(readReleaseNews({ version: 'latest', lines: ['a'] })).toBeNull();
    expect(readReleaseNews({ lines: ['a'] })).toBeNull();
  });
});
