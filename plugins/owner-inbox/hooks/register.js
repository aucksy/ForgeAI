// Owner inbox mod (owner ask 17 Oct 2026, docs/OWNER-INBOX.md #16).
//
// In the Claude desktop app (Code tab), the terminal or VS Code: type /inbox and a panel opens beside
// the chat with every open question from docs/OWNER-INBOX.md, its full context, and its choices.
// Pick a choice per question, add a note if you like, press "Send to Claude": the answer goes into
// the current chat as your own words, with the question and the option text, so Claude can act.
// A line under the prompt box says how many questions wait for you, in every session.
//
// The inbox is read from GitHub (the latest pushed copy), else from this project's own file.
// Mods cannot add an icon to the app's toolbar (not in the mods API); /inbox and the status line are
// the permanent ways in. Mods do not draw in cloud chats (claude.ai/code, the phone app): there the
// private Owner inbox page does the same job.

const PANE = 'owner-inbox'
const RAW_URL = 'https://raw.githubusercontent.com/aucksy/ForgeAI/main/docs/OWNER-INBOX.md'
const LOCAL = 'docs/OWNER-INBOX.md'
const PAGE_URL = 'https://claude.ai/artifact/9dAdwmTA8rNXiw5BHX1SJT'

// ---------------------------------------------------------------- reading the inbox (pure)

const ENTRY_RE = /^## (\d+)\. (.+?) — (.+)$/gm

export function parseInbox(text) {
  // A Windows checkout has CRLF line ends; Python reads them as "\n", so do the same here.
  text = String(text || '').replace(/\r\n/g, '\n')
  const heads = [...String(text || '').matchAll(ENTRY_RE)]
  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length
    let body = text.slice(h.index + h[0].length, end).replace(/^\n+|\n+$/g, '')
    let chat = 'Unknown chat'
    const cm = body.match(/^\*\*Chat:\*\* (.+)$/m)
    if (cm) {
      chat = cm[1].replace(/\s+—\s+https:\/\/\S+$/, '').trim()
      body = body.replace(cm[0] + '\n', '').replace(cm[0], '')
    }
    const sm = body.match(/^\*\*Status:\*\* (.+)$/m)
    const status = sm ? sm[1].trim() : ''
    const rm = body.match(/^\*\*READ \([^)\n]*\)\*\*[ \t]*(?:\r?\n|$)/m)
    if (rm) body = body.replace(rm[0], '')
    const decides = []
    // R-83 (owner, 23 Oct 2026): a question added AFTER the entry's last "**DECIDED" line is open again;
    // only the ones before it are answered (the same reading as scripts/owner_inbox_page.py).
    const lastDecided = Math.max(-1, ...[...body.matchAll(/^\*\*DECIDED/gm)].map((m) => m.index))
    for (const dm of body.matchAll(/^\*\*Decide:\*\* (.+)\n((?:- [A-Z]: .+\n?)+)/gm)) {
      if (dm.index < lastDecided) continue
      const opts = [...dm[2].matchAll(/^- ([A-Z]): (.+)$/gm)].map((om) => {
        const said = om[2].trim()
        const rec = said.endsWith('(recommended)')
        return { key: om[1], text: rec ? said.slice(0, -'(recommended)'.length).trim() : said, rec }
      })
      decides.push({ q: dm[1].trim(), opts })
    }
    body = body.replace(/^\*\*Decide:\*\* .+\n(?:- [A-Z]: .+\n?)+/gm, '').trim()
    return { num: Number(h[1]), title: h[2].trim(), date: h[3].trim(), chat, status, body, decides, read: Boolean(rm) }
  })
}

// What Send puts in the chat: the question and the chosen option in words, never just "A".
// A question left without a pick says so: a comment alone is a fine answer (OWNER-INBOX #17).
export function answerText(entry, picks, note) {
  const lines = entry.decides.map((d, qi) => {
    const o = d.opts.find((x) => x.key === picks[qi])
    return '- ' + d.q + ': ' + (o ? o.key + ' (' + o.text + ')' : 'no pick yet')
  })
  const extra = (note || '').trim()
  return 'Owner inbox #' + entry.num + ' (' + entry.title + '):\n' + lines.join('\n') + (extra ? '\nNote: ' + extra : '') +
    '\n\nPlease act on this, then mark it DECIDED in docs/OWNER-INBOX.md and update the Owner inbox page.'
}

// ---------------------------------------------------------------- the mod

let entries = []
let source = ''
let chatFilter = 'all'
let openNum = null // the question shown in full
const picks = {} // num -> {qIndex: key}
const notes = {} // num -> text
const sent = {} // num -> true once sent from this panel

const waiting = () => entries.filter((e) => e.decides.length && (chatFilter === 'all' || e.chat === chatFilter))

async function load($) {
  try {
    const r = await $.http.fetch(RAW_URL)
    const text = typeof r.text === 'function' ? await r.text() : r.text
    if (r.ok && text) {
      entries = parseInbox(text)
      source = 'GitHub (latest pushed)'
      return
    }
  } catch (e) {
    $.ui.log('owner-inbox: GitHub read failed, trying the project file: ' + (e && e.message))
  }
  try {
    entries = parseInbox(await $.fs.read(LOCAL))
    source = 'this project (' + LOCAL + ')'
  } catch (e) {
    entries = []
    source = 'not found: open a chat in the ForgeAI project, or check the internet'
  }
}

function statusLine($) {
  const n = entries.filter((e) => e.decides.length).length
  return $.ui.status(n ? 'Owner inbox: ' + n + ' question' + (n > 1 ? 's' : '') + ' wait for you · type /inbox' : 'Owner inbox: nothing waiting · /inbox')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'inbox', description: 'Open the owner inbox: pick answers and send them to Claude' })
    try {
      const saved = await $.store.get('chatFilter')
      if (typeof saved === 'string') chatFilter = saved
    } catch (err) {
      $.ui.log('owner-inbox: no saved chat filter')
    }
    await load($)
    await statusLine($)
    return next(e)
  })

  on('command.run', { command: 'inbox' }, async ($) => {
    await load($)
    await statusLine($)
    await $.ui.open({ id: PANE, title: 'Owner inbox', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button, Markdown, Input, Select } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')
    const chats = [...new Set(entries.map((x) => x.chat))]
    const list = waiting()

    const header = [
      Text({ children: [list.length + ' open question' + (list.length === 1 ? '' : 's') + ' · from ' + source] }),
      Box({
        flexDirection: 'row',
        columnGap: 2,
        children: [
          Select({
            key: 'chat',
            options: [{ value: 'all', label: 'All chats' }, ...chats.map((c) => ({ value: c, label: c }))],
            onSelect: async (v) => {
              chatFilter = v
              openNum = null
              redraw()
              await $.store.set('chatFilter', v)
            },
          }),
          Button({ key: 'reload', label: 'Reload', plain: true, onPress: async () => { await load($); await statusLine($); redraw() } }),
        ],
      }),
      Text({ children: ['On your phone: ' + PAGE_URL] }),
      Text({ children: [' '] }),
    ]

    if (!list.length) {
      return Box({ flexDirection: 'column', children: [...header, Text({ children: ['Nothing waiting for you.'] })] })
    }

    const entry = list.find((x) => x.num === openNum)
    if (!entry) {
      // The list: one button per open question.
      return Box({
        flexDirection: 'column',
        rowGap: 1,
        children: [
          ...header,
          ...list.map((x) =>
            Button({
              key: 'q' + x.num,
              label: '#' + x.num + '  ' + x.title + (sent[x.num] ? '  (sent)' : ''),
              plain: true,
              onPress: () => { openNum = x.num; redraw() },
            }),
          ),
        ],
      })
    }

    // One question in full: its choices first, then the whole context.
    const mine = picks[entry.num] || (picks[entry.num] = {})
    const blocks = entry.decides.map((d, qi) =>
      Box({
        key: 'd' + qi,
        flexDirection: 'column',
        children: [
          Text({ children: [d.q] }),
          ...d.opts.map((o) =>
            Button({
              key: 'o' + qi + o.key,
              label: (mine[qi] === o.key ? '● ' : '○ ') + o.key + '  ' + o.text + (o.rec ? '  (my pick)' : ''),
              plain: true,
              dimColor: Boolean(mine[qi]) && mine[qi] !== o.key,
              onPress: () => { mine[qi] = o.key; redraw() },
            }),
          ),
          Text({ children: [' '] }),
        ],
      }),
    )
    return Box({
      flexDirection: 'column',
      children: [
        ...header,
        Button({ key: 'back', label: '← All open questions', plain: true, onPress: () => { openNum = null; redraw() } }),
        Text({ children: ['#' + entry.num + '  ' + entry.title + '  ·  ' + entry.date + '  ·  ' + entry.chat] }),
        Text({ children: [' '] }),
        ...blocks,
        Input({
          key: 'note',
          placeholder: 'Your comment (you can send just a comment, without picking)',
          onInput: (v) => { notes[entry.num] = v },
          onSubmit: (v) => { notes[entry.num] = v; redraw() },
        }),
        Box({
          flexDirection: 'row',
          columnGap: 2,
          children: [
            Button({
              key: 'send',
              label: 'Send to Claude',
              onPress: () => {
                // A pick or a comment is enough; the note box only reports what was typed, so check here.
                if (!entry.decides.some((d, qi) => mine[qi]) && !(notes[entry.num] || '').trim()) {
                  $.ui.toast('Pick an answer or write a comment first')
                  return
                }
                const text = answerText(entry, mine, notes[entry.num])
                sent[entry.num] = true
                openNum = null
                redraw()
                // Not awaited: it waits until Claude is free, then starts a turn as your own words.
                Promise.resolve($.prompt.submit({ text, asUser: true }))
                  .then(() => $.ui.toast('Sent #' + entry.num + ' to Claude'))
                  .catch((err) => $.ui.toast('Could not send #' + entry.num + ': ' + (err && err.message)))
              },
            }),
          ],
        }),
        Text({ children: [' '] }),
        Text({ children: ['The full question and my answer:'] }),
        Markdown({ text: entry.body }),
      ],
    })
  })
}
