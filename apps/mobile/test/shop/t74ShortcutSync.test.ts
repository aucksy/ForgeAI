/**
 * T74 (R-356): a home-screen gym icon follows the gym. State changes and the upgrade path, with the
 * native shortcut calls recorded (modules/forge-phone GymShortcut.kt is drawn and tested in
 * ShortcutArtTest / GymShortcutRenderTest):
 *  - upgrade: an icon pinned by an older app is redrawn once on the next start (ask=false: nothing
 *    is asked, nothing new is pinned), and only marked done when Android took it or none is pinned;
 *  - the gym changes its logo later: redrawn without asking;
 *  - the gym removes its logo: nothing is drawn (no blank icon);
 *  - the member leaves the gym: the pinned icon is greyed out with plain words.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));

const pin = vi.fn(async (..._args: [string, string, string, boolean]) => 'updated' as string);
const off = vi.fn((_message: string) => true);
vi.mock('@/tracker/phone/native', () => ({
  phoneNative: () => ({ gymShortcutSupported: () => true, gymShortcutPin: pin, gymShortcutOff: off }),
}));

import { redrawOldArt, SHORTCUT_ART_KEY, SHORTCUT_ART_VERSION, startGymShortcutSync } from '@/shop/gymShortcut';
import { useGymShop } from '@/shop/gymStore';
import type { GymLink } from '@/shop/types';

const LOGO = `https://x.supabase.co/storage/v1/object/public/gym-logos/${'ab'.repeat(24)}/logo.png`;
const LOGO2 = LOGO.replace('logo.png', 'logo-2.png');
const LINK: GymLink = {
  memberKey: 'k'.repeat(48),
  memberId: 'm1',
  gymId: 'g-rams',
  gymName: "RAM'S FITNESS",
  joinCode: 'RAMS01',
  name: 'Asha',
  brand: { accent: '#F7D411', bg: '#0A0A0C', logoUrl: LOGO, heading: 'normal', updatedAt: null },
};

const settle = () => new Promise((r) => setTimeout(r, 20));

beforeAll(async () => {
  await useGymShop.persist.rehydrate();
});

beforeEach(() => {
  pin.mockClear();
  off.mockClear();
  pin.mockImplementation(async () => 'updated');
});

describe('T74 upgrade: an icon from an older app is redrawn once', () => {
  it('redraws without asking, with the gym colours, and remembers it did', async () => {
    useGymShop.setState({ link: LINK });
    startGymShortcutSync();
    await settle();
    expect(pin).toHaveBeenCalledTimes(1);
    const [name, url, colours, ask] = pin.mock.calls[0];
    expect(name).toBe("RAM'S FITNESS");
    expect(url).toContain('logo.png');
    expect(colours).toBe('#F7D411,#0A0A0C');
    expect(ask).toBe(false);
    expect(mem.get(SHORTCUT_ART_KEY)).toBe(SHORTCUT_ART_VERSION);
  });

  it('does not redraw again once done', async () => {
    await redrawOldArt();
    expect(pin).not.toHaveBeenCalled();
  });

  it('offline (no logo to be had): tries again next start', async () => {
    mem.delete(SHORTCUT_ART_KEY);
    pin.mockImplementation(async () => 'no-logo');
    await redrawOldArt();
    expect(pin).toHaveBeenCalledTimes(1);
    expect(mem.has(SHORTCUT_ART_KEY)).toBe(false);
  });

  it('no icon on the home screen: marked done, nothing pinned', async () => {
    pin.mockImplementation(async () => 'none');
    await redrawOldArt();
    expect(pin.mock.calls[0][3]).toBe(false);
    expect(mem.get(SHORTCUT_ART_KEY)).toBe(SHORTCUT_ART_VERSION);
  });

  it('a gym with no logo: nothing is drawn', async () => {
    mem.delete(SHORTCUT_ART_KEY);
    useGymShop.setState({ link: { ...LINK, brand: { ...LINK.brand!, logoUrl: null } } });
    await settle();
    pin.mockClear();
    await redrawOldArt();
    expect(pin).not.toHaveBeenCalled();
  });
});

describe('T74 state changes: the icon follows the gym', () => {
  it('the gym changes its logo later: redrawn without asking', async () => {
    useGymShop.setState({ link: LINK });
    await settle();
    pin.mockClear();
    useGymShop.setState({ link: { ...LINK, brand: { ...LINK.brand!, logoUrl: LOGO2 } } });
    await settle();
    expect(pin).toHaveBeenCalledTimes(1);
    expect(pin.mock.calls[0][1]).toContain('logo-2.png');
    expect(pin.mock.calls[0][3]).toBe(false);
  });

  it('the gym removes its logo: no redraw (never a blank icon)', async () => {
    useGymShop.setState({ link: { ...LINK, brand: { ...LINK.brand!, logoUrl: null } } });
    await settle();
    expect(pin).not.toHaveBeenCalled();
  });

  it('the member leaves the gym: the icon is greyed out with plain words', async () => {
    useGymShop.setState({ link: LINK });
    await settle();
    useGymShop.setState({ link: null });
    await settle();
    expect(off).toHaveBeenCalledWith("You left RAM'S FITNESS. Open MettleUp from its own icon.");
  });
});
