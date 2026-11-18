# Checkpoint A2-server-database-3

Method: read the full items list (251 lines) and the header comment of each of the 36 migration files 0063-0098
(about 800 lines), plus two searches for switches and gates, plus 0063:520-569 and 0071:22-61. The function bodies
were NOT read one by one (size limit: 2,500 code lines); each item was placed by its file's header, which names every
function and table.

Finished units (all items done, 0 left):
- [x] 0063-0064 billing: server.txt#585-607, #855-859, #948 -> F-server-500..503
- [x] 0065-0068: #608-616, #860-862 -> F-server-504..507
- [x] 0069, 0087, 0096 messages: #617-627, #714-715, #748-754, #863-864, #949-951 -> F-server-508, 509
- [x] 0070 Plus lock: #628-630, #865 -> F-server-510
- [x] 0071, 0072, 0078, 0083 AI credits: #631-648, #682-685, #700-708, #866-867, #872-873, #878, #964 -> F-server-511..513 (+#648 in 501)
- [x] 0073, 0074, 0086: #649-658, #712-713, #952-955 -> F-server-514, 515
- [x] 0075, 0076, 0095 alerts: #659-679, #741-747, #868-870, #956-963 -> F-server-516..518
- [x] 0077, 0081, 0088, 0089 join online: #680-681, #696, #716-718, #871 -> F-server-519..521
- [x] 0079: #686-687 -> F-server-522
- [x] 0080, 0082, 0090 gym page: #688-695, #697-699, #719-722, #874-877, #879, #965-966 -> F-server-523..527
- [x] 0084, 0085, 0091, 0092, 0093: #709-711, #723-732 -> F-server-528..532
- [x] 0094 page chat: #733-740, #880 -> F-server-533
- [x] 0097 read log: #755-761, #881-882, #967-968 -> F-server-534
- [x] 0098 alerts done/read: #762-778, #883, #969-975 -> F-server-535

Switches and gates met:
- app_config 'billing_checkout' (off) and HQ Worker var BILLING (0063:81-86, 0063:389)
- app_config 'receipt_issuer' (0063:82)
- gym_plus_settings.lock_after_end, default on (0070:32)
- gym_ai_member_rules.members_on + month_credits (0083:53); panel Worker AI_CREDITS_CHARGE (0083 header)
- gym_alert_settings: instant / daily / weekly (0076 header)
- Join online closed when gym suspended or gym_has_feature(gym,'addMember') is false (0077:102) = the only plan gate in this area
- joinTrialDays on the gym details record (0088:49); JOIN_PAY Worker switch (0088 header)
- gym_pages.published / indexable / hidden_by_hq (0080:58-60); gym_page_off (0090:34); Worker GYM_PAGES, PAGE_AI (0090, 0094 headers)
- Ask a trainer: member's own gym plan must cover today, pass members refused (0074 header)

Seen in passing:
- 0071_ai_assistant.sql header says "NOT APPLIED", yet 0078 and 0083 headers say "APPLIED LIVE 14 Nov" and "Apply after 0071". One of the headers is stale; live state of the AI credits wallet is unknown from the code alone.
- 0072 header says NOT APPLIED: until it is, a receipt for a gym on the retired 'ai' plan would read "Pro + AI" (0063:182), not "Pro".
- 0098 (not live) replaces hq_panel_push_instant and hq_panel_digest_claim; the source list shows only the newest (0098) text, while live runs the 0095/0076 text.

Could not check:
- Whether each "NOT APPLIED / NOT LIVE" header (0063, 0064, 0071, 0072, 0091, 0092, 0094, 0097, 0098) is still true on the live database: this step allows no database reads.
- MettleUp tier (free / Pro) of most features: no tier rule is in these files except 0077:102; written as "unknown".
- Function bodies were not opened one by one (size limit); grouping rests on the file headers.
