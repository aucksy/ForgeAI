import { describe, expect, it } from 'vitest';

import { isNewer, releaseUpdate, updateToShow, versionParts } from '@/lib/appUpdate';

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
      tag_name: 'v0.49.0',
      assets: [
        { name: 'forgeai-v0.49.0-wear.apk', browser_download_url: 'https://github.com/aucksy/ForgeAI/releases/download/v0.49.0/forgeai-v0.49.0-wear.apk' },
        { name: 'forgeai-v0.49.0.apk', browser_download_url: 'https://github.com/aucksy/ForgeAI/releases/download/v0.49.0/forgeai-v0.49.0.apk' },
      ],
    };
    expect(releaseUpdate(release)).toEqual({
      version: '0.49.0',
      url: 'https://github.com/aucksy/ForgeAI/releases/download/v0.49.0/forgeai-v0.49.0.apk',
    });
  });

  it('offers nothing without a phone APK or with a link off GitHub', () => {
    expect(releaseUpdate({ tag_name: 'v0.49.0', assets: [] })).toBeNull();
    expect(releaseUpdate({ tag_name: 'v0.49.0', assets: [{ name: 'forgeai-v0.49.0.apk', browser_download_url: 'https://evil.example/x.apk' }] })).toBeNull();
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
