// The few GitHub calls the watch scripts need (#34 alerts). The token is the workflow's own
// GITHUB_TOKEN (issues: write), passed in, never printed.

export function github({ token, repo, fetchImpl = fetch }) {
  if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are needed');
  async function call(method, path, body) {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mettleup-watch',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch((e) => `(no body: ${e})`);
      throw new Error(`GitHub ${method} ${path} answered ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.status === 204 ? null : res.json();
  }
  return {
    /** Issues (not pull requests) with this label. */
    async issues(label, state = 'open') {
      const list = await call('GET', `/issues?labels=${encodeURIComponent(label)}&state=${state}&per_page=100`);
      return list.filter((i) => !i.pull_request);
    },
    /** Makes the label if the repo does not have it yet. */
    async ensureLabel(name, color, description) {
      try {
        await call('GET', `/labels/${encodeURIComponent(name)}`);
      } catch (e) {
        if (!String(e.message).includes('answered 404')) throw e;
        await call('POST', '/labels', { name, color, description });
      }
    },
    create: (title, body, labels) => call('POST', '/issues', { title, body, labels }),
    comment: (number, body) => call('POST', `/issues/${number}/comments`, { body }),
    update: (number, fields) => call('PATCH', `/issues/${number}`, fields),
  };
}

/** "28 Oct 2026, 10:40 am" India time. PURE. */
export function indiaTime(d) {
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}
