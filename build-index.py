#!/usr/bin/env python3
"""Builds index.json and books.json for Vani from local clones of the archive.

Only names, dates, places and lengths go into the index: the words themselves
stay in the archive and are read live by the app.

  git clone --depth 1 https://github.com/iskconpress/spoken
  git clone --depth 1 https://github.com/vaniwiki/prabhupada-letters
  git clone --depth 1 --filter=blob:none --no-checkout https://github.com/vaniwiki/prabhupada-books
  python3 build-index.py spoken prabhupada-letters prabhupada-books .
"""
import json, os, re, subprocess, sys
from collections import OrderedDict

spoken_dir, letters_dir, books_dir, out_dir = sys.argv[1:5]

def field(text, key):
    m = re.search(r'^' + key + r'\s*:\s*(.*)$', text, re.M)
    return re.sub(r'\s*#\s*$', '', m.group(1)).strip() if m else ''

types, places, days = [], [], {}
DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
def valid(mmdd):
    m, d = int(mmdd[:2]), int(mmdd[2:])
    return 1 <= m <= 12 and 1 <= d <= DAYS_IN[m - 1]
def idx(lst, v):
    if v not in lst: lst.append(v)
    return lst.index(v)

def mins(s):
    m = re.match(r'^(\d+):(\d\d)(?::(\d\d))?$', s or '')
    if not m: return 0
    a, b, c = m.groups()
    return int(a) * 60 + int(b) if c else int(a) + (1 if int(b) >= 30 else 0)

for f in sorted(os.listdir(spoken_dir)):
    m = re.match(r'^(\d\d)(\d\d)(\d\d)(?:-\d+)?[a-z]+\d*\.[a-z0-9-]+\.txt$', f)
    if not m: continue
    t = open(os.path.join(spoken_dir, f), encoding='utf-8').read()
    sid = f[:-4]
    title = field(t, 'listtype_hidden') or field(t, 'Title_hidden')
    ty = field(t, 'Type_spoken') or 'Recording'
    pl = field(t, 'Place_spoken') or field(t, 'listplace_hidden')
    audio = 1 if re.search(r'\{\{https?://[^|}]+\.mp3', t) else 0
    day = m.group(2) + m.group(3)
    if not valid(day): continue
    days.setdefault(day, {'s': [], 'l': []})['s'].append([sid, title, idx(types, ty), idx(places, pl), mins(field(t, 'Length_hidden')), audio])

ld = os.path.join(letters_dir, 'letters')
for f in sorted(os.listdir(ld)):
    m = re.match(r'^(\d\d)(\d\d)(\d\d)_(.+)\.txt$', f)
    if not m: continue
    t = open(os.path.join(ld, f), encoding='utf-8').read()
    fm = re.search(r'^---json\s*(\{.*?\})\s*---', t, re.S)
    rec = ''
    try: rec = json.loads(fm.group(1)).get('h1', '').split(' — ')[0].strip() if fm else ''
    except Exception: pass
    if not rec: rec = m.group(4).replace('_', ' ').title()
    day = m.group(2) + m.group(3)
    if not valid(day): continue
    days.setdefault(day, {'s': [], 'l': []})['l'].append([f[:-4], rec])

index = OrderedDict(v=1, types=types, places=places, days=OrderedDict(sorted(days.items())))
with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as o:
    json.dump(index, o, ensure_ascii=False, separators=(',', ':'))

# Books: verse files only, compacted as ranges per chapter
names = subprocess.run(['git', '-C', books_dir, 'ls-tree', '-r', '--name-only', 'HEAD', 'books'],
                       capture_output=True, text=True, check=True).stdout.split()
chapters = {}
pat = {'bg': r'^books/bg/(\d+)/([\d-]+)\.txt$', 'sb': r'^books/sb/(\d+)/(\d+)/([\d-]+)\.txt$',
       'cc': r'^books/cc/(adi|madhya|antya)/(\d+)/([\d-]+)\.txt$'}
for n in names:
    for book, p in pat.items():
        m = re.match(p, n)
        if m:
            g = m.groups()
            chapters.setdefault(book, {}).setdefault('.'.join(g[:-1]), []).append(g[-1])

def first(v): return int(v.split('-')[0])
def compact(items):
    items = sorted(items, key=first)
    out, run = [], []
    def flush():
        if run: out.append(run[0] if len(run) == 1 else f'{run[0]}..{run[-1]}')
    for v in items:
        if '-' not in v and run and int(v) == int(run[-1]) + 1: run.append(v); continue
        flush(); run = []
        if '-' in v: out.append(v)
        else: run = [v]
    flush()
    return ','.join(out)

def ckey(k): return [int(x) if x.isdigit() else ['adi', 'madhya', 'antya'].index(x) for x in k.split('.')]
books = OrderedDict((b, '|'.join(f'{k}:{compact(v)}' for k, v in sorted(chapters[b].items(), key=lambda kv: ckey(kv[0]))))
                    for b in ('bg', 'sb', 'cc'))
with open(os.path.join(out_dir, 'books.json'), 'w', encoding='utf-8') as o:
    json.dump(books, o, ensure_ascii=False, separators=(',', ':'))
print('days', len(days), 'spoken', sum(len(d['s']) for d in days.values()), 'letters', sum(len(d['l']) for d in days.values()),
      'verses', {b: sum(len(v) for v in chapters[b].values()) for b in chapters})
