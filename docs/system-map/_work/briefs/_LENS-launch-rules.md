# Launch rules for lens items (L19, L14, L7, L8, L9, L12, L16) - pilot lessons from L19-hq-app (21 Nov 2026)
- Your brief names the screens folder. For abuse, security and data checks you MAY also read the server and
  database code behind those screens (stay under about 400 lines of it), and cite it as evidence.
- merge.mjs --dry warns "no blind file given": that is expected; the coordinator runs the blind check. Ignore it.
- Areas: use the area your brief gives (for example hq/app) even when the evidence is server code.
- Reuse an existing finding id when the same fault is already in findings.jsonl; add no duplicate.
- Never open the audit plan, OWNER-INBOX, CLAUDE-NOTES or AUDIT-STATE. No git. Change no app code.
- Nothing heavy on this laptop: no builds, test suites or dev servers.
