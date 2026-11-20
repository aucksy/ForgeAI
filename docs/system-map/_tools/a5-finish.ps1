param([string]$id, [string]$tokens, [string]$line)
# One A5 report: done-check, merge + state + push (finish.ps1), then the generated journeys, then push again.
# The run id and the msg.txt path live in finish.ps1; the msg.txt path below must match it.
$r = 'C:\Users\Aakash Pahuja\AppData\Local\Temp\claude\19050ed31f641eaa\a75edd9f-3244-414f-b133-ce887d21fe49\scratchpad\wt-audit'
Set-Location $r
$blind = 'C:/Users/Aakash Pahuja/.claude/audit-blind-patterns.txt'
node docs/system-map/_tools/merge.mjs $id --dry --a5cover "docs/system-map/_work/items/$id.txt" --blind $blind | Where-Object { $_ -notmatch '^WARN a5cover: .* lists no entity' } | Select-Object -Last 6
if ($LASTEXITCODE -ne 0) { "A5 DONE-CHECK FAILED: not merged"; exit 1 }
powershell -NoProfile -File docs/system-map/_tools/finish.ps1 $id $tokens $line
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$ex = node docs/system-map/_tools/expand.mjs $id; $ex | Select-Object -Last 1
node docs/system-map/_tools/merge.mjs "$id-gen" --blind $blind | Select-Object -Last 1
$m = (Select-String -Path docs/system-map/_tools/finish.ps1 -Pattern "^\`$m = '(.+)'").Matches[0].Groups[1].Value
Set-Content $m "Audit: $id generated journeys merged`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -Encoding ascii
git add docs/system-map 2>$null
git commit -q -F $m
git push -q origin HEAD:main
if ($LASTEXITCODE -ne 0) { git fetch -q origin; git merge -q origin/main -m "merge origin/main"; git push -q origin HEAD:main }
"gen push exit $LASTEXITCODE"
