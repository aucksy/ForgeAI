/**
 * R-485 (owner, 13 Nov 2026, "gym logo kaise badlu"): "answer can be single here... why giving 2 CTAs?"
 * The AI called how_to AND open_page; the panel showed "Help and feedback answers it" (Open Help and feedback)
 * and "Where to do it" (3 steps, Open Branding). One question = one answer: the page card wins.
 */
import { describe, expect, it } from 'vitest';

import type { Action } from '../../../src/crm/assistant/catalogue';
import { cardsFor } from '../../../src/crm/assistant/conversation';
import { planData } from './gym';

let n = 0;
const newId = () => `id${++n}`;
const d = planData();
const howTo = { tool: 'how_to', input: { question: 'How do I change my gym logo?' } } as Action;
const branding = {
  tool: 'open_page',
  input: { page: 'branding', why: 'Change your gym logo shown in the member app.', steps: ['Open Branding from the menu', 'Tap the logo and choose a new image', 'Save the changes'] },
} as Action;

describe('a how-to question gets ONE answer', () => {
  it('how_to + open_page: only the page card with its steps and button, in either order', () => {
    for (const actions of [[howTo, branding], [branding, howTo]]) {
      const cards = cardsFor(actions, d, newId);
      expect(cards.map((c) => c.kind)).toEqual(['open_page']);
      expect(cards[0]).toMatchObject({ kind: 'open_page', steps: ['Open Branding from the menu', 'Tap the logo and choose a new image', 'Save the changes'] });
    }
  });

  it('how_to alone (no page answers it) still shows the Help and feedback card', () => {
    expect(cardsFor([howTo], d, newId).map((c) => c.kind)).toEqual(['help']);
  });

  it('a page card never removes anything but the Help card', () => {
    const ask = { tool: 'ask_back', input: { question: 'Which logo?', options: ['Gym', 'App'] } } as Action;
    expect(cardsFor([ask, branding, howTo], d, newId).map((c) => c.kind)).toEqual(['ask_back', 'open_page']);
  });
});
