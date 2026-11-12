# F201 privacy lines (draft, NOT on the live page; needs the owner's yes, word for word)

Checked against the code on 12 Nov 2026: deploy/panel/assist.js (what Claude sees: lines 12-15, 223, 238-273;
masking 150-192; voice: Groq unless SARVAM_API_KEY is set). Sarvam is NOT named because its key is not set; add a
Sarvam line (and check Sarvam's own retention terms first) only when that key goes in.

## 1. New bullet in section E (the gym side), right after "Importing an old member list"

> **The AI Assistant (gym owners only):** what the owner types or says goes to Anthropic's Claude AI so it can
> understand the request and get a message or a change ready. With it go today's date, the gym's name, its plan
> names, lengths and prices, batch names and trainers' first names. Mobile numbers, email addresses and long card or
> account numbers in the request are hidden before it is sent. A member's name goes only if the owner says it. The
> AI gets no member records: the admin app looks those up itself. When the owner asks to change a message's
> wording, Claude reads that message. A spoken request goes through our server to Groq, which turns it into text;
> neither we nor Groq keep the recording. Anthropic does not use any of this to train its AI. We keep each request,
> what the owner did with it and the credits it used, so the owner can see them in the admin app.

## 2. Table of outside companies (section on who we share with)

- Anthropic (Claude) row, "What for": add "Understands AI Assistant requests and rewrites message drafts."
  "What they see": add "the owner's request with mobile numbers and emails hidden; the gym's plan, batch and
  trainer first names".
- Groq row, "What for": "Turns spoken feedback and spoken AI Assistant requests into text".

## 3. "What changed" line at the top
"[date]: added the AI Assistant for gym owners (what goes to Claude and Groq)."
