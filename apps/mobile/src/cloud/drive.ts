/**
 * Google Drive backup/restore for ForgeAI — member-owned FULL-history backup.
 *
 * Ported from ColorCloset's proven `src/lib/drive.ts` (same Expo SDK 56 / RN 0.85
 * stack). Sign-in is native (`@react-native-google-signin/google-signin`), so it
 * needs a dev/preview build — NOT Expo Go. We request the narrow `drive.file` scope
 * (the app only sees files it created), keep ONE canonical backup file
 * (`forgeai-backup.json`) inside a dedicated "ForgeAI" folder, and talk to the Drive
 * v3 REST API directly with the access token. `drive.file` access is tied to the
 * OAuth client + user, so the backup is still found after a reinstall or new phone.
 *
 * OFFLINE FIREWALL: this module constructs / calls nothing until the user taps a
 * Drive action. `isDriveConfigured()` stays false until the owner sets a real
 * `googleWebClientId` in app.json > extra, so the offline demo never engages Google.
 *
 * Requires: `extra.googleWebClientId` (Web OAuth client id) + an Android OAuth client
 * registered with `com.forgeai.app` + the build's signing SHA-1. See supabase/README
 * / docs (the SHA-1 gate). This is a member-owned backup, independent of gym sync —
 * Supabase only ever holds the one-row summary.
 */
import Constants from 'expo-constants';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

const FILE_NAME = 'forgeai-backup.json';
const FOLDER_NAME = 'ForgeAI';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/** The Web OAuth client id, read from app config (placeholder until the owner sets it). */
const webClientId: string =
  (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)?.googleWebClientId ?? '';

let configured = false;

/** True once a real Web client id has been provided (not the placeholder). */
export function isDriveConfigured(): boolean {
  return !!webClientId && !webClientId.startsWith('REPLACE_WITH');
}

/** Configure Google Sign-In once. No-op (and safe) when the client id isn't set. */
export function configureDrive(): void {
  if (configured || !isDriveConfigured()) return;
  try {
    GoogleSignin.configure({ webClientId, scopes: [SCOPE], offlineAccess: false });
    configured = true;
  } catch {
    // Swallow — surfaced later when the user actually taps a Drive action.
  }
}

export class DriveError extends Error {}

function ensureReady(): void {
  if (!isDriveConfigured()) throw new DriveError('Google Drive isn’t set up in this build.');
  configureDrive();
}

/** Pull the email off whatever shape this google-signin version returns. */
function emailOf(res: unknown): string | null {
  const r = res as { data?: { user?: { email?: string } }; user?: { email?: string } } | null;
  return r?.data?.user?.email ?? r?.user?.email ?? null;
}

/**
 * Interactive sign-in. Returns the account email, or null ONLY when the user
 * genuinely cancels. Every other failure THROWS a DriveError with an actionable
 * message (so the UI never silently no-ops). The most common failure on a fresh
 * signing key is DEVELOPER_ERROR / an empty result — the build's package + SHA-1
 * isn't registered as an Android OAuth client in the Google Cloud project.
 */
export async function signInToDrive(): Promise<string | null> {
  ensureReady();
  let res: unknown;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    res = await GoogleSignin.signIn();
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return null; // genuine user cancel
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
        throw new DriveError('Google Play services isn’t available on this device.');
    }
    // DEVELOPER_ERROR (10) isn't in this version's typed statusCodes — match it loosely.
    const code = (e as { code?: unknown })?.code;
    if (code === 'DEVELOPER_ERROR' || code === 10 || code === '10') {
      throw new DriveError(
        'Google sign-in isn’t authorised for this build. Its signing key (SHA-1) for com.forgeai.app must be added as an Android OAuth client in Google Cloud.',
      );
    }
    const msg = (e as { message?: string })?.message;
    throw new DriveError(`Couldn’t sign in to Google${msg ? `: ${msg}` : '.'}`);
  }
  if ((res as { type?: string })?.type === 'cancelled') return null;
  const email = emailOf(res);
  if (!email) {
    // Account chosen but Google returned no usable account — almost always a missing
    // Android OAuth client (package + SHA-1) in the Cloud project.
    throw new DriveError(
      'Signed in, but Google returned no account — the app’s Android OAuth client (com.forgeai.app + SHA-1) is likely missing in Google Cloud.',
    );
  }
  return email;
}

/** Silent sign-in (no UI). Returns the email if a session exists, else null. */
export async function getCurrentDriveUser(): Promise<string | null> {
  if (!isDriveConfigured()) return null;
  configureDrive();
  try {
    const res = await GoogleSignin.signInSilently();
    const t = (res as { type?: string })?.type;
    if (t && t !== 'success') return null;
    return emailOf(res);
  } catch {
    return null;
  }
}

export async function signOutDrive(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    /* ignore */
  }
}

/** Get a fresh access token, refreshing the silent session first. */
async function accessToken(): Promise<string> {
  ensureReady();
  try {
    // On google-signin v16 signInSilently() RESOLVES with a non-'success' type
    // (e.g. 'noSavedCredentialFound') instead of throwing when there's no session,
    // so we must inspect the result — matching getCurrentDriveUser above — and map
    // any getTokens() rejection to the same actionable message.
    const res = await GoogleSignin.signInSilently();
    const t = (res as { type?: string })?.type;
    if (t && t !== 'success') throw new DriveError('Not signed in to Google.');
    const { accessToken: token } = await GoogleSignin.getTokens();
    if (!token) throw new DriveError('Couldn’t get a Google access token.');
    return token;
  } catch (e) {
    if (e instanceof DriveError) throw e;
    throw new DriveError('Not signed in to Google.');
  }
}

async function api(token: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new DriveError(`Drive request failed (${res.status}). ${detail.slice(0, 140)}`);
  }
  return res;
}

/**
 * Find our dedicated "ForgeAI" Drive folder (creating it if missing) and return its
 * id, so the backup lives in its own folder rather than loose in My Drive.
 * `drive.file` scope only sees folders this app created — exactly what we want.
 */
async function ensureFolderId(token: string): Promise<string> {
  const q = encodeURIComponent(
    `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
  );
  // orderBy=createdTime so if two devices ever race-create a duplicate folder,
  // every device deterministically converges on the earliest-created one.
  const url = `${DRIVE}/files?q=${q}&spaces=drive&orderBy=createdTime&pageSize=1&fields=files(id)`;
  const res = await api(token, url);
  const json = (await res.json()) as { files?: { id: string }[] };
  const existing = json.files?.[0]?.id;
  if (existing) return existing;

  const create = await api(token, `${DRIVE}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  const created = (await create.json()) as { id?: string };
  if (!created.id) throw new DriveError('Couldn’t create the ForgeAI folder on Drive.');
  return created.id;
}

/** Find our single backup file id inside the ForgeAI folder (most recent), or null. */
async function findBackupId(token: string, folderId: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name = '${FILE_NAME}' and '${folderId}' in parents and trashed = false`,
  );
  const url = `${DRIVE}/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&pageSize=1&fields=files(id,modifiedTime)`;
  const res = await api(token, url);
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

/**
 * Upload `data` (the exportSnapshot() JSON string) to Drive, creating the backup
 * file the first time and overwriting it after that. Returns an ISO timestamp.
 */
export async function backupToDrive(data: string): Promise<string> {
  const token = await accessToken();
  const folderId = await ensureFolderId(token);
  const existing = await findBackupId(token, folderId);

  if (existing) {
    await api(token, `${UPLOAD}/files/${existing}?uploadType=media&fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: data,
    });
  } else {
    const boundary = 'forgeai-backup-boundary';
    const metadata = JSON.stringify({
      name: FILE_NAME,
      mimeType: 'application/json',
      parents: [folderId],
    });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${data}\r\n` +
      `--${boundary}--`;
    await api(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }
  return new Date().toISOString();
}

/** Download the backup file contents (the JSON string), or null if none exists. */
export async function restoreFromDrive(): Promise<string | null> {
  const token = await accessToken();
  const folderId = await ensureFolderId(token);
  const id = await findBackupId(token, folderId);
  if (!id) return null;
  const res = await api(token, `${DRIVE}/files/${id}?alt=media`);
  return res.text();
}
