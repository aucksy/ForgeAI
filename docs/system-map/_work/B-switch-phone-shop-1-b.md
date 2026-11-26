# B-switch-phone-shop-1-b checkpoint (gap-6, phone/shop-1)
- H6.1 done: fill counts from field-fill.csv (Crispy only): check-in phone 1/2, birthday 1/2, trainer 0/2, app link 0/2, batch 0/2, plan dates 1/1, phone 2/2.
- H6.2 done: check-in phone asked only at first QR check-in (or find-gym, behind switch); invite join asks name only -> FN-B-switch-phone-shop-1-b-01.
- H6.3 done: membership/plan-end/reminders/diet need check-in phone (FN-01); trainer join line in InviteScreen:176 same as FN-B-switch-phone-onboarding-db-b-02 (reused); app link and batch not used by features here; birthday reminder 1/2 (not most; covered by panel birthday findings).
- H6.4/H6.5 done: check-in mobile box (mobileInput, Hindi digits, +91, 0, 00 91, spaces, dashes) keeps a valid value; name box cut at 70 ok; hidden staff PIN box (maxLength 7, strips spaces/dashes) fits 6-digit pastes. No finding.
