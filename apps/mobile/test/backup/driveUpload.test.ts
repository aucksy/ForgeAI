/**
 * R-123: the Drive calls for the backup FILE (src/cloud/drive.ts) — a resumable upload streamed from
 * the file on disk (never a copy in memory), the oldest copies beyond 5 deleted only after the new one
 * is up, and the newest downloaded straight to disk. Google is a stand-in; no network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as { url: string; method: string; headers: Record<string, string>; body?: string }[],
  uploads: [] as { url: string; file: string; options: Record<string, unknown> }[],
  downloads: [] as { url: string; file: string; options: Record<string, unknown> }[],
  files: [] as { id: string; name: string; modifiedTime: string; appProperties?: Record<string, string> }[],
  uploadStatus: 200,
}));

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { googleWebClientId: '123-abc.apps.googleusercontent.com' } } } }));
vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: () => undefined,
    signInSilently: async () => ({ type: 'success' }),
    getTokens: async () => ({ accessToken: 'tok' }),
  },
  isErrorWithCode: () => false,
  statusCodes: {},
}));
// The legacy file system shares the native stub with AsyncStorage (vitest.config.ts).
vi.mock('@react-native-async-storage/async-storage', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  uploadAsync: async (url: string, file: string, options: Record<string, unknown>) => {
    h.uploads.push({ url, file, options });
    return { status: h.uploadStatus, body: h.uploadStatus === 200 ? '{"id":"new"}' : '{"error":{"message":"quota"}}', headers: {} };
  },
  downloadAsync: async (url: string, file: string, options: Record<string, unknown>) => {
    h.downloads.push({ url, file, options });
    return { status: 200, uri: file, headers: {} };
  },
  deleteAsync: async () => undefined,
  default: {},
}));

function respond(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
}

beforeEach(() => {
  h.calls = [];
  h.uploads = [];
  h.downloads = [];
  h.uploadStatus = 200;
  h.files = [3, 7, 1, 9, 5, 8].map((d) => ({ id: `f${d}`, name: `mettleup-backup-2026-10-0${d}-180000.zip`, modifiedTime: `2026-10-0${d}T12:00:00.000Z` }));
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    h.calls.push({ url, method, headers: (init?.headers ?? {}) as Record<string, string>, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.includes('uploadType=resumable')) return respond({}, { location: 'https://upload.example/session-1' });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (url.includes("mimeType%20%3D%20'application%2Fvnd.google-apps.folder'")) return respond({ files: [{ id: 'folder-1' }] });
    return respond({ files: h.files });
  });
});

describe('Drive: the backup file goes up and comes back as a file', () => {
  it('uploads with a resumable session from disk, then keeps only the newest 5', async () => {
    const { uploadBackupFile } = await import('@/cloud/drive');
    await uploadBackupFile('file:///cache/mettleup-backup-2026-10-25.zip', 123456, 42);
    const start = h.calls.find((c) => c.url.includes('uploadType=resumable'))!;
    expect(start.method).toBe('POST');
    expect(start.headers['X-Upload-Content-Length']).toBe('123456');
    const meta = JSON.parse(start.body!) as { name: string; mimeType: string; parents: string[]; appProperties: Record<string, string> };
    expect(meta).toMatchObject({ mimeType: 'application/zip', parents: ['folder-1'], appProperties: { workouts: '42' } });
    expect(meta.name).toMatch(/^mettleup-backup-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/);
    // The file itself: one PUT to the session, streamed by the phone from disk.
    expect(h.uploads).toEqual([{ url: 'https://upload.example/session-1', file: 'file:///cache/mettleup-backup-2026-10-25.zip', options: expect.objectContaining({ httpMethod: 'PUT', uploadType: 0 }) }]);
    // Six on Drive: the oldest one goes (5 kept), and only after the upload.
    const deletes = h.calls.filter((c) => c.method === 'DELETE').map((c) => c.url.split('/').pop());
    expect(deletes).toEqual(['f1']);
    expect(h.calls.findIndex((c) => c.method === 'DELETE')).toBeGreaterThan(h.calls.indexOf(start));
  });

  it('a refused upload deletes nothing and says so', async () => {
    h.uploadStatus = 403;
    const { uploadBackupFile, DriveError } = await import('@/cloud/drive');
    await expect(uploadBackupFile('file:///cache/x.zip', 10)).rejects.toBeInstanceOf(DriveError);
    expect(h.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('downloads the newest backup straight to disk, signed in; an old database-only backup is marked', async () => {
    const { downloadNewestBackup } = await import('@/cloud/drive');
    const got = await downloadNewestBackup('file:///cache/');
    expect(got).toEqual({ uri: 'file:///cache/drive-mettleup-backup-2026-10-09-180000.zip', name: 'mettleup-backup-2026-10-09-180000.zip', old: false });
    expect(h.downloads[0].url).toMatch(/\/files\/f9\?alt=media$/);
    expect(h.downloads[0].options).toEqual({ headers: { Authorization: 'Bearer tok' } });

    h.files = [{ id: 'old', name: 'forgeai-backup-2026-10-01-090000.json', modifiedTime: '2026-10-01T03:30:00.000Z' }];
    expect(await downloadNewestBackup('file:///cache/')).toMatchObject({ old: true });
  });
});
