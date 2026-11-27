import io, os, re
base = os.path.dirname(os.path.abspath(__file__))
s = io.open(os.path.join(base, 'cards-09.md'), encoding='utf-8').read()
groups = [l.strip() for l in open(os.path.join(base, 'cards-09.txt')) if l.strip()]
for l in s.splitlines():
    if l.startswith('### '):
        n = len(l[4:].split())
        print(n, 'LONG' if n > 12 else '', l[4:])
print('cards', s.count('### '), 'decisions', s.count('**Your decision:**'), 'findings', s.count('\nFinding: '), 'groups', len(groups))
bad = ['RPC', 'API', 'null', 'migration', 'endpoint', 'flag', 'cron', 'token', 'Worker', 'RLS', ' CI', '.ts', '.sql', '.html', 'bytea', 'table']
for w in bad:
    if w in s:
        print('CODEWORD', w)
