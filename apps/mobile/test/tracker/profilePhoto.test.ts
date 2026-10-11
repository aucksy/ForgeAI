/**
 * Redesign R2 — the Profile photo is kept like a progress photo: copied in, its path saved, and
 * only THEN the old photo and the picker's cache copy removed. A failed save keeps the old photo.
 */
import { describe, expect, it } from 'vitest';

import { isOwnProfilePhoto, keepProfilePhoto, type ProfilePhotoDeps } from '@/tracker/services/profilePhoto';

const DIR = 'file:///app/files/profile-photo/';

function deps(o: Partial<ProfilePhotoDeps> & { log: string[] }): ProfilePhotoDeps {
  const { log } = o;
  return {
    dir: DIR,
    cacheDir: 'file:///app/cache/',
    mkdir: async () => void log.push('mkdir'),
    copy: async (from, to) => void log.push(`copy ${from} -> ${to}`),
    remove: async (uri) => void log.push(`remove ${uri}`),
    previous: async () => `${DIR}old.jpg`,
    save: async (uri) => void log.push(`save ${uri}`),
    newId: () => 'new',
    ...o,
  };
}

describe('the Profile photo', () => {
  it('copies in, saves the path, then removes the old photo and the cache copy', async () => {
    const log: string[] = [];
    const uri = await keepProfilePhoto({ uri: 'file:///app/cache/ImagePicker/x.png' }, deps({ log }));
    expect(uri).toBe(`${DIR}new.png`);
    expect(log).toEqual([
      'mkdir',
      `copy file:///app/cache/ImagePicker/x.png -> ${DIR}new.png`,
      `save ${DIR}new.png`,
      `remove ${DIR}old.jpg`,
      'remove file:///app/cache/ImagePicker/x.png',
    ]);
  });

  it('a failed save removes the new copy and keeps the old photo', async () => {
    const log: string[] = [];
    const d = deps({ log, save: async () => Promise.reject(new Error('disk full')) });
    await expect(keepProfilePhoto({ uri: 'content://gallery/1.jpg' }, d)).rejects.toThrow('disk full');
    expect(log).toContain(`remove ${DIR}new.jpg`);
    expect(log).not.toContain(`remove ${DIR}old.jpg`);
  });

  it('never deletes a file outside its own folder', async () => {
    const log: string[] = [];
    await keepProfilePhoto({ uri: 'content://gallery/1.jpg' }, deps({ log, previous: async () => 'file:///somewhere/else.jpg' }));
    expect(log.some((l) => l.includes('else.jpg'))).toBe(false);
    expect(isOwnProfilePhoto(`${DIR}a.jpg`, DIR)).toBe(true);
    expect(isOwnProfilePhoto(`${DIR}sub/a.jpg`, DIR)).toBe(false);
    expect(isOwnProfilePhoto(null, DIR)).toBe(false);
  });
});
