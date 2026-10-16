/**
 * A refused permission is the member's answer, not a fault (phone test, 16 Oct 2026: the Monkey
 * run logged the camera picker's "User rejected permissions" as a [ForgeErr] workout photo error).
 */
import { describe, expect, it } from 'vitest';

import { isPermissionRefusal } from '@/lib/permissionRefusal';

const PICKER_REFUSAL =
  "Call to function 'ExponentImagePicker.launchCameraAsync' has been rejected.\n→ Caused by: User rejected permissions";

describe('isPermissionRefusal', () => {
  it('the camera picker rejecting because the member said no is a refusal', () => {
    expect(isPermissionRefusal(new Error(PICKER_REFUSAL))).toBe(true);
    expect(isPermissionRefusal(new Error('User rejected permissions'))).toBe(true);
    expect(isPermissionRefusal(new Error('user REJECTED permission'))).toBe(true);
  });

  it("our own 'camera-denied' (the permission ask said no) is a refusal", () => {
    expect(isPermissionRefusal(new Error('camera-denied'))).toBe(true);
  });

  it('other wordings of a refused or missing permission are refusals', () => {
    expect(isPermissionRefusal(new Error('Camera permission denied'))).toBe(true);
    expect(isPermissionRefusal(new Error('Missing camera permission'))).toBe(true);
    expect(isPermissionRefusal({ code: 'ERR_MISSING_PERMISSIONS', message: 'x' })).toBe(true);
  });

  it('the refusal can sit in the cause of a wrapped error', () => {
    const outer = new Error('launch failed', { cause: new Error('User rejected permissions') });
    expect(isPermissionRefusal(outer)).toBe(true);
  });

  it('real failures are not refusals, even when the call "has been rejected"', () => {
    expect(isPermissionRefusal(new Error("Call to function 'ExponentImagePicker.launchCameraAsync' has been rejected.\n→ Caused by: No camera available"))).toBe(false);
    expect(isPermissionRefusal(new Error('disk full'))).toBe(false);
    expect(isPermissionRefusal(new Error('limit'))).toBe(false);
  });

  it('nothing, plain values and odd shapes are not refusals and never throw', () => {
    expect(isPermissionRefusal(undefined)).toBe(false);
    expect(isPermissionRefusal(null)).toBe(false);
    expect(isPermissionRefusal(42)).toBe(false);
    expect(isPermissionRefusal({})).toBe(false);
    expect(isPermissionRefusal('User rejected permissions')).toBe(true);
    const loop: { message: string; cause?: unknown } = { message: 'boom' };
    loop.cause = loop;
    expect(isPermissionRefusal(loop)).toBe(false);
  });
});
