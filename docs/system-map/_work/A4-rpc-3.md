# A4-rpc-3 checkpoint

Finished: all 75 groups of readers-raw.txt lines 780-1028 looked at (function -> newest definition -> main table).
Written to docs/system-map/_work/out/A4-rpc-3.jsonl: 12 entity rows, 57 reader rows (badge 1, count 1, list 10, not-a-reader 42, screen 3).
Groups 1-75 done. Nothing left to read; the cap of 12 new entity rows is used up.

## entity rows still to write (reader rows left out: 43 candidates)
- E-entry-machine-members (table entry_machine_members): 1 candidate(s): owner_set_machine_numbers
- E-entry-machines (table entry_machines): 3 candidate(s): owner_entry_machines, owner_queue_machine_commands, owner_remove_entry_machine
- E-gym-ai-member-rules (table gym_ai_member_rules): 1 candidate(s): owner_save_ai_member_rules
- E-gym-alert-settings (table gym_alert_settings): 1 candidate(s): owner_save_alert_settings
- E-gym-alerts (table gym_alerts): 1 candidate(s): owner_send_test_alert
- E-gym-auto-reminders (table gym_auto_reminders): 2 candidate(s): owner_save_auto_reminders
- E-gym-challenge-hits (table gym_challenge_hits): 1 candidate(s): owner_confirm_challenge_reward
- E-gym-challenges (table gym_challenges): 1 candidate(s): owner_save_challenge
- E-gym-friend-referrals (table gym_friend_referrals): 2 candidate(s): owner_friend_summary
- E-gym-groups (table gym_groups): 1 candidate(s): owner_rename_group
- E-gym-machine-setup (table gym_machine_setup): 2 candidate(s): owner_machine_setup, owner_save_machine_setup
- E-gym-member-board (table gym_member_board): 1 candidate(s): owner_hide_on_board
- E-gym-owner-keys (table gym_owner_keys): 1 candidate(s): owner_retire_key
- E-gym-page-photo-slots (table gym_page_photo_slots): 1 candidate(s): owner_gym_page_photo_slot
- E-gym-pages (table gym_pages): 2 candidate(s): owner_gym_page, owner_save_gym_page
- E-gym-phone-links (table gym_phone_links): 2 candidate(s): owner_decide_phone_link, owner_phone_links
- E-gym-plus-settings (table gym_plus_settings): 2 candidate(s): owner_plus_lock, owner_save_plus_lock
- E-gym-progress-summaries (table gym_progress_summaries): 2 candidate(s): owner_member_progress
- E-gym-receipts (table gym_receipts): 1 candidate(s): owner_receipt
- E-gym-report-requests (table gym_report_requests): 3 candidate(s): owner_report_file, owner_report_requests, owner_request_report
- E-gym-signin-codes (table gym_signin_codes): 1 candidate(s): owner_make_signin_code
- E-gym-trainer-profiles (table gym_trainer_profiles): 1 candidate(s): owner_save_trainer_profile
- E-gym-web-push (table gym_web_push): 2 candidate(s): owner_clear_web_push, owner_save_web_push
- E-gym-wods (table gym_wods): 2 candidate(s): owner_gym_wods, owner_save_gym_wod
- E-hq-grants (table hq_grants): 3 candidate(s): owner_hq_access, owner_hq_end, owner_hq_grant
- E-mettleup-payments (table mettleup_payments): 2 candidate(s): owner_pay_mettleup, owner_report_mettleup_payment
- E-photo-tickets (table photo_tickets): 1 candidate(s): owner_photo_ticket

## seen in passing
- none

## could not check
- Which roles may see each table is read from the function guards in the migrations, not from the live database.
- Retention: only trainer_questions has a delete rule in the files read; the rest is "unknown".
- Reader kinds for the panel wrappers come from the wrapper and the screen that calls it; the screens themselves were not read line by line.
