# A5-phone-native-2 checkpoint

F-phone-1205: 5 journeys, 7 type lines
F-phone-1210: 6 journeys, 8 type lines
F-phone-1204: 5 journeys, 7 type lines
F-phone-1203: 4 journeys, 8 type lines
F-phone-1211: 4 journeys, 8 type lines
F-phone-1214: 4 journeys, 8 type lines
F-phone-1216: 5 journeys, 8 type lines
F-phone-1217: 5 journeys, 7 type lines
F-phone-1206: 6 journeys, 7 type lines

Entities: no entity exists for phone-only settings (workout sounds, DND switch, rest sound) or for a ticked set kept on the phone; writes/reads left empty there (E-member-items is only the later cloud copy, not linked).
Seen in passing: the 'Off' check-up row for a blocked 'Rest is over' channel opens the app-wide notification page, not the blocked channel's page (restAlertAccess.ts openFixFor 'off').
Seen in passing: with the app closed, the LAST set of a workout can never be ticked by the phone itself (OfflineTick.find needs a next step), so it always shows the 'Open MettleUp to save' note.
Seen in passing: the watch colour is sent with the next workout update, so a gym colour change can reach the watch mid-workout (not checked when the app calls it).
Could not check: the watch's own drawing of the gym colour and its diary writer (watch code not in my items).
Findings: FN-A5-phone-native-2-01, FN-A5-phone-native-2-02.
