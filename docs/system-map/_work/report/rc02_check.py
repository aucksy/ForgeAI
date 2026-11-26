import io,re
s=io.open('cards-02.md',encoding='utf-8').read()
for l in s.splitlines():
    if l.startswith('### '): print(len(l[4:].split()), l[4:])
print(s.count('### '), s.count('**Your decision:**'), s.count('\nFinding: '))
bad=['RPC','API','null','migration','endpoint','flag','cron','token','Worker','RLS',' CI','.ts','.tsx','.sql','localStorage','function']
for b in bad:
    if b in s: print('WORD',b)
ids=[l.split()[1].rstrip(';') for l in s.splitlines() if l.startswith('Finding: ')]
import json
cards={c['group']:c for c in json.load(open('cards.json',encoding='utf-8'))}
gs=[l.strip() for l in open('cards-02.txt') if l.strip()]
print([g for g,i in zip(gs,ids) if cards[g]['top']!=i])
