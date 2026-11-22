# L16-panel-pay-machines checkpoint
- 2026-11-22 L16.1 done: 9 quiet catches read (1 fault: machine upload), dead code (2), duplicated date rules (1); 12 no-test-import rows: UI files whose logic is tested elsewhere; machines/memoryStore is used via test/crm/machines/pretendMachine.ts (tool false positive). Findings 01-03.
- 2026-11-22 L16.2 done: area tests use fixed clocks and stubbed fetch; no flaky pattern found.
