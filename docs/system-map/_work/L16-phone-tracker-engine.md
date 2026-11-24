# L16-phone-tracker-engine checkpoint
- started 2026-11-24; inputs read
- dead: bodyHistory.ts used only by test (FN-01 planned). streak 2nd rule exists FN-L16-phone-lib-core-01 (reuse). longest-week-streak copied reports.ts:129 + badges.ts:167
- dead: balanceBlock swap code retired by R-483 still exported+tested (balanceBlock.ts:205,249,272,307,401). silent catch: balanceBlock.ts:348, routineSets.ts:73. flaky: f194MachineSteps.test.ts:242-246 wall-clock <2000ms. medians x4, day-count copies x6. export scan running
- historyChart bar helpers (tapBar 171, barLayout 207, shownBar 222, chartTicks 247, chartXText, chartXLabelIndexes) unused by card (HistoryChartCard.tsx:109,118-123) but tested (historyChart.test.ts:24-31,88-92). writing out file next
- out file written, 6 findings, grid L16.1+L16.2 checked
