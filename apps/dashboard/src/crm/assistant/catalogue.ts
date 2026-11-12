/**
 * F201: the assistant's fixed catalogue (tools, pages, "Try saying" examples), shared with the panel worker.
 * ONE file holds it (deploy/panel/assistCatalogue.js, types beside it), so the server's tool list and the
 * admin app's cards can never drift apart. Everything in the assistant folder imports it from here.
 */
export * from '../../../../../deploy/panel/assistCatalogue.js';

/** A line of words for the owner: English with {values}; the screen shows it through t(text, vars). */
export interface Line {
  text: string;
  vars?: Readonly<Record<string, string | number>>;
}

export const line = (text: string, vars?: Record<string, string | number>): Line => (vars ? { text, vars } : { text });
