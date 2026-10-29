/**
 * Member photos on screen (F107): whether this desk can take them, a member's picture, and the round
 * avatar that shows the photo or, without one, the member's initials. The photo buttons show only
 * when the gym is online AND its server keeps photos (0043): until then everything here quietly
 * draws initials, exactly as before.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { initials } from '../logic/members';
import {
  photoOf,
  photoServer,
  photosVersion,
  probePhotoServer,
  requestPhotos,
  subscribePhotos,
} from '../shop/memberPhotoApi';
import { Avatar, color, radius } from './kit';

function usePhotosVersion(): number {
  return useSyncExternalStore(subscribePhotos, photosVersion, photosVersion);
}

/** The desk's key when photos can be taken here, else null (offline gym, demo, or a server without 0043). */
export function useDeskPhotoKey(): string | null {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  usePhotosVersion();
  const state = photoServer();
  useEffect(() => {
    if (key && state === 'unknown') void probePhotoServer(key);
  }, [key, state]);
  return key && state === 'yes' ? key : null;
}

/** A member's picture (a data: picture), or null while there is none or it is still loading. */
export function useMemberPhoto(memberId: string | null | undefined): string | null {
  const key = useDeskPhotoKey();
  usePhotosVersion();
  useEffect(() => {
    if (key && memberId) requestPhotos(key, [memberId]);
  }, [key, memberId]);
  if (!key || !memberId) return null;
  return photoOf(memberId) ?? null;
}

/** The member's photo in a circle, or their initials when there is none. */
export function MemberAvatar({ memberId, name, size = 36 }: { memberId: string; name: string; size?: number }) {
  const photo = useMemberPhoto(memberId);
  if (!photo) return <Avatar text={initials(name)} size={size} />;
  return (
    <img
      src={photo}
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        border: `1px solid ${color.border}`,
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
        background: color.accentSoft,
      }}
    />
  );
}
