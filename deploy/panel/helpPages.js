// F209: the answer from the help pages when the AI is not asked (the gym has no AI credit left, or the person used
// today's AI questions). No AI call: the words of the question are matched against the help articles' titles and text
// (helpArticles.js, the same pages the AI answers from), and the best one or two are sent back. Never an error: with no
// match, the person reads the usual "we reply as soon as we can". Every line here is read by members and gym staff.

import { HELP_ARTICLES } from './helpArticles.js';

export const MAX_PAGES_ANSWER = 1200;

// Words that say nothing about what the person needs (English and Hinglish in Latin letters).
const STOP = new Set(
  (
    'the and for you your our can how what why when where who does did not are was were has have had with from this that ' +
    'there here then than into onto about please help want need any some all its it’s get got use using used make made ' +
    'will would should could just also very more most much many one two app admin member gym mettleup ' +
    'kaise kya kyu kyun kab kahan hai hain nahi nhi mera meri mere apna apni karna karo kare kar raha rahi tha thi ' +
    'mujhe hum aap ko ka ki ke se me mein par aur bhi'
  ).split(' '),
);

/** The words worth matching, lower case, no duplicates. PURE. */
export function wordsOf(text) {
  const out = new Set();
  for (const w of String(text ?? '').toLowerCase().match(/[\p{L}\p{Nd}]+/gu) ?? []) {
    if (w.length < 3 || STOP.has(w)) continue;
    out.add(w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
  }
  return [...out];
}

/** Does `word` appear in `hay` (a word set)? A word also matches a longer form ("renew" in "renewal"). PURE. */
function has(hay, word) {
  if (hay.has(word)) return true;
  if (word.length < 4) return false;
  for (const h of hay) if (h.startsWith(word) || (h.length >= 4 && word.startsWith(h))) return true;
  return false;
}

/**
 * The help articles that best match a question, best first (at most `max`). Members see member articles, the admin
 * app sees owner articles; 'both' articles go to everyone. PURE.
 */
export function matchPages(text, source, articles = HELP_ARTICLES, max = 2) {
  const want = wordsOf(text);
  if (!want.length) return [];
  const mine = articles.filter((a) => a.who === 'both' || a.who === (source === 'admin' ? 'owner' : 'member'));
  const scored = mine
    .map((a) => {
      const title = new Set(wordsOf(a.title));
      const body = new Set(wordsOf(a.text));
      let score = 0;
      for (const w of want) score += has(title, w) ? 3 : has(body, w) ? 1 : 0;
      return { a, score };
    })
    .filter((x) => x.score >= 2)
    .sort((x, y) => y.score - x.score || x.a.title.localeCompare(y.a.title));
  if (!scored.length) return [];
  const best = scored[0].score;
  return scored.filter((x) => x.score * 2 >= best).slice(0, max).map((x) => x.a);
}

/** Why the AI was not asked, in the words of the person reading. PURE. */
export function whyLine(reason, source, who, perDay = 0) {
  if (source !== 'admin') {
    if (reason === 'day_limit') return `You have used today's ${perDay || 10} AI answers. AI answers come back tomorrow.`;
    return 'AI answers are not on at your gym right now.';
  }
  if (reason === 'day_limit') return "You have used today's AI answers. They come back tomorrow.";
  if (reason === 'paused') return 'AI answers are paused for your gym. Write to MettleUp here to turn them back on.';
  if (who === 'owner') return 'Your gym has no AI credits left, so this answer is from the help pages. To get more, open AI Assistant and tap your credits at the top.';
  return 'Your gym has no AI credits left, so this answer is from the help pages. Ask your gym owner to get more AI credits.';
}

/**
 * The whole answer without AI: why, then the matching help page(s), then that the team reads every message.
 * -> { text, pages: number }. PURE.
 */
export function pagesAnswer(text, source, why, articles = HELP_ARTICLES) {
  const pages = matchPages(text, source, articles);
  const tail = 'We read every message and reply as soon as we can.';
  if (!pages.length) return { text: `${why} ${tail}`.slice(0, MAX_PAGES_ANSWER), pages: 0 };
  const head = pages.length === 1 ? 'This help page may answer your question:' : 'These help pages may answer your question:';
  let out = `${why}\n\n${head}`;
  for (const p of pages) {
    const block = `\n\n${p.title}\n${p.text}`;
    if (out.length + block.length + tail.length + 2 > MAX_PAGES_ANSWER) {
      const room = MAX_PAGES_ANSWER - out.length - tail.length - 6 - p.title.length;
      if (room > 120) out += `\n\n${p.title}\n${p.text.slice(0, room).replace(/\s+\S*$/, '')}…`;
      break;
    }
    out += block;
  }
  return { text: `${out}\n\n${tail}`, pages: pages.length };
}
