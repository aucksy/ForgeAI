/**
 * Silent-failure audit (14 Oct 2026): the words and rules that make each failure visible.
 *  - H2 reminders: a failure says "Couldn't set reminders. Try again.", never "Set.".
 *  - H3 widgets: Android's "yes" to a pin is not a placed widget; no new widget = the hint.
 *  - M1 Open Health Connect: nothing opened → where to find it.
 *  - M3 Coach mic: why it did not listen.
 *  - M5 Import: the answer's re-read failed.
 *  - M6 Widget/shortcut Start: "Couldn't start <routine>."
 */
import { describe, expect, it } from 'vitest';

import { voiceProblemFor, voiceProblemText } from '@/lib/voiceProblem';
import { HC_OPEN_FAILED } from '@/tracker/phone/healthConnect';
import { REMINDERS_FAILED, reminderCaption } from '@/tracker/phone/reminders';
import { startFailedText } from '@/tracker/phone/widgetLink';
import { pinNotPlaced, widgetHintText } from '@/tracker/phone/widgets';
import { answerReadProblemText } from '@/tracker/services/importWords';

describe('H2 — reminders that could not be set say so', () => {
  it('says "Couldn\'t set reminders. Try again." instead of "Set."', () => {
    const c = reminderCaption({ on: true, blocked: false, next: null, days: 3, failed: true });
    expect(c).toBe("Couldn't set reminders. Try again.");
    expect(c).not.toMatch(/^Set\./);
  });
  it('blocked notifications and no days still come first (their own fix)', () => {
    expect(reminderCaption({ on: true, blocked: true, next: null, days: 3, failed: true })).toMatch(/Notifications are off/);
    expect(reminderCaption({ on: true, blocked: false, next: null, days: 0, failed: true })).toBe('Pick at least one day.');
  });
  it('off is off, failed or not', () => {
    expect(reminderCaption({ on: false, blocked: false, next: null, days: 3, failed: true })).toMatch(/quiet reminder/);
  });
  it('the failure value is not a time and not "none"', () => {
    expect(REMINDERS_FAILED).not.toBeNull();
    expect(typeof REMINDERS_FAILED).not.toBe('number');
  });
});

describe('H3 — a pin request is not a placed widget', () => {
  it('no more widgets than before = not placed', () => {
    expect(pinNotPlaced(0, 0)).toBe(true);
    expect(pinNotPlaced(2, 2)).toBe(true);
    expect(pinNotPlaced(1, 0)).toBe(true); // one removed meanwhile
    expect(pinNotPlaced(0, 1)).toBe(false);
  });
  it('both hints point to the long-press way round', () => {
    expect(widgetHintText('refused')).toMatch(/Long-press your home screen → Widgets → MettleUp/);
    expect(widgetHintText('notPlaced')).toMatch(/Long-press your home screen → Widgets → MettleUp/);
  });
});

describe('M1 — Open Health Connect that opened nothing', () => {
  it('points to the phone\'s Settings', () => {
    expect(HC_OPEN_FAILED).toBe("Couldn't open Health Connect. Open your phone's Settings → Health Connect.");
  });
});

describe('M3 — the Coach mic says why', () => {
  it('a refused microphone, voice typing off and a failed start read differently', () => {
    expect(voiceProblemText('denied')).toMatch(/microphone is off/);
    expect(voiceProblemText('speech-off')).toBe('Voice typing is off on this phone. Turn on Google voice typing in your phone settings.');
    expect(voiceProblemText('speech-off')).not.toMatch(/microphone/);
    expect(voiceProblemText('error')).toMatch(/Couldn’t start listening/);
  });
  it('the microphone permission and speech switched off are told apart', () => {
    expect(voiceProblemFor('not-allowed')).toBe('denied');
    expect(voiceProblemFor('service-not-allowed')).toBe('speech-off');
    expect(voiceProblemFor('no-speech')).toBeNull();
    expect(voiceProblemFor(undefined)).toBeNull();
  });
});

describe('M5 — Import answer that could not be read', () => {
  it('names what failed in plain words and asks again (never the raw error)', () => {
    expect(answerReadProblemText('units')).toBe('Couldn’t read the file in those units. Please choose again.');
    expect(answerReadProblemText('dates')).toBe('Couldn’t read the dates that way. Please choose again.');
  });
});

describe('M6 — a widget or shortcut Start that failed', () => {
  it('names the routine, or the workout when it is not known', () => {
    expect(startFailedText('Push Day')).toBe("Couldn't start Push Day.");
    expect(startFailedText(null)).toBe("Couldn't start the workout.");
    expect(startFailedText('  ')).toBe("Couldn't start the workout.");
  });
});
