# H2-verify-01 checkpoint (pilot)

## LESSONS for the next H2 helpers
1. Pull rows fast: one tiny python loop over finding-groups.jsonl (key "group") for your ids, then one loop over findings.jsonl (key "id") printing only id/severity/what/expected/evidence. Two calls, never read the files whole.
2. Open each evidence pointer with sed -n A,Bp (under 100 lines). For SQL, first grep -ln "function public.<name>" supabase/migrations/* : the LAST file listed is the live definition; a fix in a later migration is the commonest way a claim turns false.
3. Phone claims: check apps/mobile/app.json version and src/lib/whatsNew.ts. The worktree is newer than many findings; a fault may already be fixed on main (G-0008 was) - then mark false and say "waiting for release", not true.
4. Look for the one flag that could save the claim (e.g. a "paid" field on the record, a guard in the caller, a disclosure elsewhere in privacy.html) and grep for any writer of it. No writer found = the claim stands.
5. Severity: most S1s here were real but S2 in effect (rare path, opt-in, same-gym only, already disclosed elsewhere). Keep S1 only for silent loss, takeover, children's data, or an unnamed outside company.
6. Live switches and keys (API keys, Play version) cannot be read from code: say "true in code, live key not checkable" or "unsure"; the public Play page does not render its version to a fetch.
7. Append one JSON row and one checkpoint line after every group with a python heredoc; 15 groups took about 70k tokens.

## Progress
- G-0001 true (S1->S2: rare path)
- G-0002 true (S1->S2: opt-in, own Google account, caption is honest)
- G-0003 true (S1->S2: divide-back needs rep delta not on picture)
- G-0004 true (S1->S2: only the same gym sees it)
- G-0005 true (S1->S2: logged, disclosed in privacy)
- G-0007 true (S1->S2, same root as G-0005)
- G-0006 true (S1 kept)
- G-0008 FALSE (fixed on main in 0.80.0)
- G-0010 true (S1 kept)
- G-0013 unsure (needs Play Console version read)
- G-0009 true (S1->S2: designed trade-off, data recoverable on server)
- G-0011 true (S1 kept)
- G-0012 true (S1->S2: needs 45+ day old paid request)
- G-0014 true (S1->S2: Google already named, paid key)
- G-0015 true (S1 kept; live key unknown)

DONE: 15/15. true 13, false 1 (G-0008), unsure 1 (G-0013).
