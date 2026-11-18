# G0: writes redacted copies of the two owner documents. Never prints what it removes. Usage: python redact.py <blind pattern file>
import re, sys, os
pats = [l.split(':',1)[1].strip() for l in open(sys.argv[1], encoding='utf-8') if l.startswith('pattern:')]
rx = re.compile('|'.join(pats))
root = os.path.join(os.path.dirname(__file__), '..', '..', '..')
def redact(src, out):
    lines = open(os.path.join(root, src), encoding='utf-8').read().replace('\r\n', '\n').split('\n')
    blocks, cur = [], []
    for l in lines:                      # a block = a heading with its body, cut at the next heading
        if l.startswith('#') and cur: blocks.append(cur); cur = []
        cur.append(l)
    blocks.append(cur)
    kept, removed = [], 0
    for b in blocks:
        if rx.search(b[0]): removed += 1; continue          # whole heading block
        paras, p = [], []
        for l in b:                                          # then paragraphs and table rows
            if l.startswith('|'):
                if p: paras.append(p); p = []
                paras.append([l]); continue
            p.append(l)
            if not l.strip(): paras.append(p); p = []
        if p: paras.append(p)
        for q in paras:
            if rx.search('\n'.join(q)): removed += 1
            else: kept.extend(q)
    assert not rx.search('\n'.join(kept))
    n = 0
    for i in range(0, len(kept), 600):
        n += 1
        open(os.path.join(os.path.dirname(__file__), '..', '_sources', f'{out}-part{n:02d}.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(kept[i:i+600]) + '\n')
    print(f'{src}: {len(lines)} lines in, {len(kept)} kept, {removed} blocks removed, {n} parts')
redact('docs/OWNER-INBOX.md', 'owner-inbox-redacted')
redact('docs/CLAUDE-NOTES.md', 'claude-notes-redacted')
