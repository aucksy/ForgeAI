F-panel-510: 12 journeys, 14 type lines
F-panel-510 note: members, plans, memberships and payments all map to E-crm-records (no finer entity exists).
Seen in passing: the member page words (Edit, Collect payment, Archive member, the Details labels) are plain strings, not translated, so that page stays English when the panel is in Hinglish (apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:400-412, 700-712).
