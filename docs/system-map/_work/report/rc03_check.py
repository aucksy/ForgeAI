import json,re,io
s=io.open('cards-03.md',encoding='utf-8').read()
cards={c['group']:c for c in json.load(open('cards.json',encoding='utf-8'))}
gs=[l.strip() for l in open('cards-03.txt') if l.strip()]
tops=re.findall(r'\nFinding: (\S+)',s)
print('order ok', tops==[cards[g]['top'] for g in gs], len(tops))
for l in s.splitlines():
    if l.startswith('### '): 
        n=len(l[4:].split()); print(n,'!!' if n>12 else '', l[4:])
print(s.count('### '),s.count('**Your decision:**'))
for w in ['RPC','API','null','migration','endpoint','flag','cron','token','Worker','RLS',' CI','.ts','.sql','workflow','e2e','console']:
    if w in s: print('CODEWORD',w)
