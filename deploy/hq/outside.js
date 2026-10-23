// HQ's two small calls to other services: GitHub's own download counts per release (public, no key
// needed; GITHUB_TOKEN is optional and only raises GitHub's hourly limit), and removing a deleted
// gym's pictures from Supabase Storage (with the HQ key, as the gym delete runbook's last step).

const releaseMemo = { at: 0, value: null };
const RELEASE_TTL_MS = 10 * 60 * 1000;

export function clearReleaseMemo() {
  releaseMemo.at = 0;
  releaseMemo.value = null;
}

/** Member-app releases, newest first: tag, date, APK downloads, all downloads. null when GitHub is down. */
export async function releases(env, { fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (releaseMemo.value && nowMs - releaseMemo.at < RELEASE_TTL_MS) return releaseMemo.value;
  const repo = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.HQ_GITHUB_REPO || '') ? env.HQ_GITHUB_REPO : 'aucksy/ForgeAI';
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'forgeai-hq' };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=15`, { headers });
    if (!res.ok) {
      console.warn('[hq-github] releases answered', res.status);
      return null;
    }
    const list = await res.json();
    const value = (Array.isArray(list) ? list : []).map((r) => {
      const assets = Array.isArray(r.assets) ? r.assets : [];
      const count = (pick) => assets.filter(pick).reduce((n, a) => n + (Number(a.download_count) || 0), 0);
      return {
        tag: String(r.tag_name || ''),
        publishedAt: r.published_at || null,
        apkDownloads: count((a) => /\.apk$/i.test(a.name || '')),
        allDownloads: count(() => true),
      };
    });
    releaseMemo.at = nowMs;
    releaseMemo.value = value;
    return value;
  } catch (e) {
    console.warn('[hq-github] releases unreachable', e instanceof Error ? e.message : 'error');
    return null;
  }
}

/**
 * Remove files from Supabase Storage. files: [{ bucket, path }] (only the two picture buckets).
 * -> { removed: n, left: [{ bucket, path }] } (left = remove by hand in the Supabase dashboard).
 */
export async function removeFiles(env, files, { fetchImpl = fetch } = {}) {
  const ok = (Array.isArray(files) ? files : []).filter(
    (f) => f && (f.bucket === 'gym-logos' || f.bucket === 'product-photos') && /^[0-9a-f]{48}\/[A-Za-z0-9._-]{1,80}$/.test(f.path || ''),
  );
  const left = [];
  let removed = 0;
  for (const bucket of ['gym-logos', 'product-photos']) {
    const paths = ok.filter((f) => f.bucket === bucket).map((f) => f.path);
    if (paths.length === 0) continue;
    try {
      const res = await fetchImpl(`${env.SUPABASE_URL}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { apikey: env.SUPABASE_HQ_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) {
        console.error('[hq-storage] remove answered', res.status, bucket);
        left.push(...paths.map((path) => ({ bucket, path })));
        continue;
      }
      removed += paths.length;
    } catch (e) {
      console.error('[hq-storage] remove failed', bucket, e instanceof Error ? e.message : 'error');
      left.push(...paths.map((path) => ({ bucket, path })));
    }
  }
  return { removed, left };
}
