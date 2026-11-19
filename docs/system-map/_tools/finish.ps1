param([string]$id, [string]$tokens, [string]$line)
$r = 'C:\Users\Aakash Pahuja\AppData\Local\Temp\claude\19050ed31f641eaa\a75edd9f-3244-414f-b133-ce887d21fe49\scratchpad\wt-audit'
Set-Location $r
Set-Content -Path 'D:\Apps\ForgeAI\audit-pacer.lock' -Value ("pacer-1119-2204 " + (Get-Date -Format o)) -Encoding ascii
node docs/system-map/_tools/merge.mjs $id --blind "C:/Users/Aakash Pahuja/.claude/audit-blind-patterns.txt"
$code = $LASTEXITCODE
"merge exit $code"
$itemsFile = "docs/system-map/_work/items/$id.txt"
$miss = @()
if (Test-Path $itemsFile) {
  $ids = Get-Content $itemsFile | Where-Object { $_.Trim() } | ForEach-Object { ($_ -split ' \| ')[0] }
  $out = Get-Content "docs/system-map/_work/out/$id.jsonl" -Raw
  $miss = @($ids | Where-Object { -not $out.Contains('"' + $_ + '"') })
  "items $($ids.Count) missing $($miss.Count)"
  $miss | Select-Object -First 8
}
if ($code -ne 0) {
  "REJECTS:"; Get-Content "docs/system-map/_work/rejects/$id.txt" -TotalCount 15
  exit 1
}
if ($miss.Count -gt 0) { "NOT MARKED DONE: lines missing"; exit 2 }
node docs/system-map/_tools/state.mjs done $id $tokens $line
node docs/system-map/_tools/state.mjs summary | Select-Object -Last 2
$m = 'C:\Users\AAKASH~1\AppData\Local\Temp\claude\19050ed31f641eaa\4b55d8bd-ded6-40a2-a911-80a32eb7da3f\scratchpad\msg.txt'
Set-Content $m "Audit: $id merged`n`nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>" -Encoding ascii
git add docs/system-map 2>$null
git commit -q -F $m
git push -q origin HEAD:main
if ($LASTEXITCODE -ne 0) { git fetch -q origin; git merge -q origin/main -m "merge origin/main"; git push -q origin HEAD:main }
"push exit $LASTEXITCODE"
node docs/system-map/_tools/state.mjs next 2
