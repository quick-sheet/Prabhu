/* Vani core: reading the archive, choosing the day's words, finding a passage.
   No DOM and no dependencies. Works in the browser (window.Vani) and in Node (require). */
(function (root) {
  'use strict';

  /* ---------- Where the words live ---------- */
  // The archive is read live; nothing from it is stored in this app's repository.
  const SRC = {
    books: ['https://raw.githubusercontent.com/vaniwiki/prabhupada-books/master/books/', 'https://cdn.jsdelivr.net/gh/vaniwiki/prabhupada-books@master/books/'],
    spoken: ['https://raw.githubusercontent.com/iskconpress/spoken/master/', 'https://cdn.jsdelivr.net/gh/iskconpress/spoken@master/'],
    letters: ['https://raw.githubusercontent.com/vaniwiki/prabhupada-letters/master/letters/', 'https://cdn.jsdelivr.net/gh/vaniwiki/prabhupada-letters@master/letters/'],
  };
  const PAGE = {
    books: 'https://github.com/vaniwiki/prabhupada-books/blob/master/books/',
    spoken: 'https://github.com/iskconpress/spoken/blob/master/',
    letters: 'https://github.com/vaniwiki/prabhupada-letters/blob/master/letters/',
  };
  const AUDIO_HOSTS = /^https:\/\/(prabhupada\.nyc3\.cdn\.digitaloceanspaces\.com|prabhupada\.nyc3\.digitaloceanspaces\.com|media\.prabhupada\.io)\//;
  const audioFor = (id) => `https://prabhupada.nyc3.cdn.digitaloceanspaces.com/spoken/${yearOf(id)}/${id}.mp3`;

  const kindOf = (id) => (/^(bg|sb|cc)\//.test(id) ? 'books' : /^\d{6}_/.test(id) ? 'letters' : 'spoken');
  const urls = (id) => SRC[kindOf(id)].map((b) => b + id + '.txt');
  const pageUrl = (id) => PAGE[kindOf(id)] + id + '.txt';

  /* ---------- Dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mmdd = (d) => pad(d.getMonth() + 1) + pad(d.getDate());
  // Whole days since 1 January 1970 for a local calendar date (no time zone drift)
  const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  const yearOf = (id) => 1900 + parseInt(String(id).slice(0, 2), 10);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dateOf = (id) => { const s = String(id); return { year: yearOf(s), month: +s.slice(2, 4), day: +s.slice(4, 6) }; };
  const longDate = (id) => { const d = dateOf(id); return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`; };

  // FNV-1a, so every phone picks the same words on the same day
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ---------- The day's index ---------- */
  const BOOK_TYPES = { 'Śrīmad-Bhāgavatam': 1, 'Bhagavad-gītā': 1, 'Śrī Caitanya-caritāmṛta': 1, 'Nectar of Devotion': 1, 'Śrī Īśopaniṣad': 1, 'Śrī Brahma-saṁhitā': 1 };
  const EXPAND = [[/^SB\.? /, 'Śrīmad-Bhāgavatam '], [/^Bg\.? /, 'Bhagavad-gītā '], [/^C[Cc]\.? /, 'Caitanya-caritāmṛta '], [/^Iso /, 'Śrī Īśopaniṣad ']];
  const LOWER = /\b(Walk|Conversation|Conversations|Lecture|Lectures|Speech|Interview|Initiation|Purport|Song|Arrival|Departure|Address|Meeting|Talk|Class|Festival|Ceremony|Wedding|Harmonium|Recorded|Partially|Instructions|Discussion|Reading|Questions|Answers|And|With|On|At|To|Of|The|In|For)\b/g;

  function sentenceCase(s) {
    const t = s.replace(LOWER, (w) => w.toLowerCase());
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function spokenInfo(row, index) {
    const [id, title, ti, pi, mins, audio] = row;
    const type = index.types[ti] || '';
    const place = index.places[pi] || '';
    let t = String(title || type).trim();
    for (const [re, full] of EXPAND) t = t.replace(re, full);
    let label;
    if (BOOK_TYPES[type]) {
      if (/^The Nectar of Devotion|^Nectar of Devotion/.test(t)) t = 'The Nectar of Devotion';
      label = /lecture/i.test(t) ? sentenceCase(t) : `Lecture on ${t}`;
    } else label = sentenceCase(t);
    const d = dateOf(id);
    return { kind: 'spoken', id, title: label, type, place, mins: mins || 0, audio: !!audio, ...d };
  }
  function letterInfo(row) {
    const [id, to] = row;
    return { kind: 'letters', id, title: `Letter to ${to}`, to, place: '', mins: 0, audio: false, ...dateOf(id) };
  }

  // Everything for one calendar day, by year
  function dayItems(index, key) {
    const day = (index && index.days && index.days[key]) || { s: [], l: [] };
    const items = day.s.map((r) => spokenInfo(r, index)).concat(day.l.map(letterInfo));
    items.sort((a, b) => a.year - b.year || (a.kind === b.kind ? 0 : a.kind === 'spoken' ? -1 : 1) || a.id.localeCompare(b.id));
    const years = [];
    for (const it of items) {
      let y = years[years.length - 1];
      if (!y || y.year !== it.year) { y = { year: it.year, items: [], place: '' }; years.push(y); }
      y.items.push(it);
      if (!y.place && it.place) y.place = it.place;
    }
    return { items, years };
  }

  // How much each kind of item is worth as the day's words
  function weight(it) {
    if (it.kind === 'letters') return 2;
    if (/^(Hindi|Bengali|Various)$/.test(it.type) || /bhajan|kirtan|chanting|japa|reading|wedding|initiation/i.test(it.title)) return 0;
    let w = BOOK_TYPES[it.type] ? 3 : /walk/i.test(it.title) ? 2.4 : /lecture|speech|address|arrival|purport|interview/i.test(it.title) ? 2.6 : 1.2;
    if (it.audio) w += 0.6;
    if (it.mins && it.mins < 6) w *= 0.3;
    return w;
  }

  // An ordered list for the day: the first one that yields a good passage is shown.
  // The same date gives the same order on every phone.
  function featuredOrder(items, dateStr) {
    const r = rng(hash('vani:' + dateStr));
    const pool = items.map((it) => ({ it, k: Math.pow(r(), 1 / Math.max(0.0001, weight(it))) })).filter((x) => weight(x.it) > 0);
    pool.sort((a, b) => b.k - a.k);
    return pool.map((x) => x.it);
  }
  // The best item for one year of the thread (same rule, limited to that year)
  const bestOfYear = (items, dateStr, year) => featuredOrder(items.filter((i) => i.year === year), dateStr + ':' + year);

  /* ---------- Books index ---------- */
  function decodeBooks(b) {
    const out = {};
    for (const book of Object.keys(b)) {
      const list = [];
      for (const ch of b[book].split('|')) {
        const [key, items] = ch.split(':');
        const base = book + '/' + key.split('.').join('/') + '/';
        for (const tok of items.split(',')) {
          const m = /^(\d+)\.\.(\d+)$/.exec(tok);
          if (m) for (let v = +m[1]; v <= +m[2]; v++) list.push(base + v);
          else list.push(base + tok);
        }
      }
      out[book] = list;
    }
    return out;
  }

  // A different Gita verse each day, not repeating until all 653 have come round
  function verseOfDay(list, date) {
    const n = list.length;
    if (!n) return null;
    let step = 271; while (gcd(step, n) !== 1) step++;
    const i = ((dayNumber(date) * step) % n + n) % n;
    return list[i];
  }
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  // Open the book: the Gita more often than its size alone would give
  function randomVerse(books, rand) {
    const r = rand || Math.random;
    const x = r();
    const book = x < 0.4 ? 'bg' : x < 0.75 ? 'sb' : 'cc';
    const list = books[book];
    return list[Math.floor(r() * list.length)];
  }

  /* ---------- Reading a file ---------- */
  // Turns the archive's DokuWiki text into blocks: headings, paragraphs, verse lines,
  // speakers, time marks and the recording's address.
  function parse(text) {
    const meta = {};
    let body = String(text || '').replace(/\r\n?/g, '\n');
    const fm = /^---json\s*\n([\s\S]*?)\n---\s*\n/.exec(body);
    if (fm) { try { Object.assign(meta, JSON.parse(fm[1])); } catch (e) { /* keep going */ } body = body.slice(fm[0].length); }
    const blocks = [];
    let para = [], verse = null, sec = '', who = '', inData = false, inAudio = false;
    const flushPara = () => {
      if (para.length) {
        const raw = para.join(' ').replace(/\s+/g, ' ').trim();
        if (raw) blocks.push({ t: 'p', raw, sec, who });
      }
      para = [];
    };
    const flushVerse = () => { if (verse) { blocks.push({ t: 'verse', lines: verse, sec }); verse = null; } };
    for (const line0 of body.split('\n')) {
      const line = line0.replace(/\s+$/, '');
      let m;
      if (inData) {
        if (/^----\s*$/.test(line)) { inData = false; continue; }
        if ((m = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(line))) meta[m[1]] = m[2].replace(/\s*#\s*$/, '').trim();
        continue;
      }
      if (/^---- dataentry/.test(line)) { flushPara(); flushVerse(); inData = true; continue; }
      if ((m = /^~~(Title|bc):\s*(.*?)~~$/.exec(line))) { meta[m[1] === 'Title' ? 'pageTitle' : 'bc'] = m[2]; continue; }
      if (/^<audio>/.test(line)) inAudio = true;
      if ((m = /\{\{(https?:\/\/[^|}\s]+\.mp3)(?:\|[^}]*)?\}\}/.exec(line))) { meta.audio = m[1]; if (/<\/audio>/.test(line)) inAudio = false; continue; }
      if (inAudio) { if (/<\/audio>/.test(line)) inAudio = false; continue; }
      if (/^<\/?[a-z][^>]*>\s*$/i.test(line) || /^<iterator|^<\/iterator/.test(line)) continue;
      if ((m = /^(={2,6})\s*(.*?)\s*\1\s*$/.exec(line))) {
        flushPara(); flushVerse();
        const level = 7 - m[1].length;   // ====== is 1
        if (level >= 2) { sec = m[2]; who = ''; }
        blocks.push({ t: 'h', level, text: m[2] });
        continue;
      }
      if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); (verse = verse || []).push(m[1]); continue; }
      flushVerse();
      if (!line.trim()) { flushPara(); continue; }
      if ((m = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*$/.exec(line))) { flushPara(); blocks.push({ t: 'time', s: secs(m[1]) }); continue; }
      if ((m = /^\*\*([^*]{1,60}?):\*\*\s*(.*)$/.exec(line))) {
        flushPara();
        who = m[1].trim();
        blocks.push({ t: 'who', who });
        if (m[2]) para.push(m[2]);
        continue;
      }
      if (/^----+\s*$/.test(line)) { flushPara(); continue; }
      para.push(line);
    }
    flushPara(); flushVerse();
    return { meta, blocks };
  }
  function secs(s) { const p = s.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }

  /* ---------- Inline text ---------- */
  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkLabel = (target, label) => {
    if (label != null) return label;
    const last = target.split(':').pop();
    return last.replace(/[_-]/g, ' ');
  };
  // Plain words, for choosing a passage and for sharing
  function plain(raw) {
    return String(raw)
      .replace(/\[\[([^|\]]+)(?:\|(\[[^\]]*\]|[^\]]*))?\]\]/g, (_, a, b) => linkLabel(a, b))
      .replace(/\{\{[^}]*\}\}/g, '')
      .replace(/\*\*|__/g, '').replace(/\/\/(?=\S)|(?<=\S)\/\//g, '')
      .replace(/\\\\\s*/g, ' ')
      .replace(/---/g, ' — ').replace(/\s+—\s+/g, ' — ')
      .replace(/\s+/g, ' ').trim();
  }
  const plainSmart = (raw) => smart(plain(raw));
  // Typographer's quotes for prose; in verse lines an apostrophe is always ’ (the avagraha)
  function smart(s, verseLine) {
    s = String(s);
    if (verseLine) return s.replace(/'/g, '’');
    return s
      .replace(/(^|[\s(\[—–-])"/g, '$1“').replace(/"/g, '”')
      .replace(/(^|[\s(\[—–-])'(?=[A-Za-zĀ-ſḀ-ỿ])/g, '$1‘').replace(/'/g, '’');
  }
  // Safe HTML: escaped first, then only bold, italic, line breaks and reference labels
  function inline(raw, verseLine) {
    let s = escHtml(smart(raw, verseLine));
    s = s.replace(/\[\[([^|\]]+)(?:\|(\[[^\]]*\]|[^\]]*))?\]\]/g, (_, a, b) => {
      const lab = linkLabel(a, b);
      return /^books:|^\[/.test(a) || /^\[.*\]$/.test(lab) ? `<span class="ref">${lab}</span>` : lab;
    });
    s = s.replace(/\{\{[^}]*\}\}/g, '');
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>');
    s = s.replace(/\/\/(?=\S)([\s\S]*?\S)\/\//g, '<i>$1</i>');
    s = s.replace(/__([\s\S]+?)__/g, '<i>$1</i>');
    s = s.replace(/\\\\\s*/g, '<br>');
    s = s.replace(/---/g, ' — ').replace(/\s+—\s+/g, ' — ');
    return s;
  }
  // Drop the archive's citation links from a short passage; they stay in the full text
  const stripRefs = (raw) => String(raw).replace(/\s*\[\[[^|\]]*\|\[[^\]]*\]\]\]/g, '').replace(/\s*\[\[books:[^\]]*\]\]/g, '');

  /* ---------- Choosing a passage ---------- */
  const GOOD = /\b(kṛṣṇa|krishna|krsna|krsna's|god|lord|devotee|devotees|devotional|devotion|bhakti|service|serve|spiritual|soul|chant|chanting|hare|love|loving|mercy|guru|spiritual master|consciousness|surrender|mind|happy|happiness|peace|peaceful|eternal|knowledge|blissful|bliss|life|purpose|sincere|sincerely|pure|purity|real|truth|transcendental|humble|humility|faith|heart|perfection|perfect|liberation|liberated|vedic|bhagavad|scripture|teach|teaching|preach|preaching|enthusiasm|patience|determination|tolerance|tolerate|compassion|prasādam|prasadam|holy name|lotus feet|remember|always|never|everyone|human)\b/gi;
  const BAD = /\b(money|dollars?|rupees?|\$|cheque|check|bank|ticket|tickets|visa|passport|telegram|cable|telex|address|phone|telephone|enclosed|enclosing|enclose|account|accounts|invoice|lawyer|court|airport|flight|receipt|acknowledge|dated|postal|mail|shipment|shipping|price|cost|costs|budget|loan|payment|paid|pay|amount|deposit|signed|signature|copies|printing|printed|press|lb|kg|percent|contract|tax|permit|plot|land|construction|building|architect)\b/gi;
  const UNCLEAR = /\[(?:break|indistinct|inaudible|unclear|end|aside|laughter|laughs|chuckles|Hindi|Bengali|Sanskrit|break\s*\(?\d*\)?)[^\]]*\]|\(\?\)|\.\.\.|…/i;
  const WEAK_START = /^(and|but|or|that|this|these|those|it|he|she|they|them|his|her|so that|then|yes|no|oh|ah|hm|hmm|now|because|otherwise|similarly)\b/i;
  const MANTRA = /hare (kṛṣṇa|krishna|krsna),? hare (kṛṣṇa|krishna|krsna)|hare rāma,? hare rāma|oṁ namo/i;
  const PERSONAL = /\b(wife|husband|son|daughter|married|marriage|pregnant|pregnancy|baby|divorce|health|ill|sick|illness|doctor|medicine|hospital|operation)\b/gi;
  const NAMES = /\b(mahārāja|maharaja|maharaj|swami|svāmī|prabhu|dāsa|dasa|das|devī|devi|mr|mrs|dr|ji|babu)\b/gi;
  const HARSH = /\b(fool|fools|foolish|rascal|rascals|nonsense|figs|cheat|cheater|cheaters|demon|demons|rogue|rogues|dog|dogs|hog|hogs|ass|asses|stool|stools|stupid)\b/gi;
  const SANSKRIT_LINE = /^\s*\/\/[^/]+\/\/[\s.,;:\]]*$/;
  const OPEN = /^(my dear|dear|please accept my blessings|i beg to|i am in due receipt|i am in receipt|i have received|i thank you|thank you|i am very glad to receive|hoping this meets|hope this meets|your ever well-wisher|yours ever|with my blessings)/i;

  function sentences(raw) {
    // Split on sentence ends that are followed by a capital, quote or bracket. Keeps the markup.
    const out = [];
    const re = /[^.!?]+(?:[.!?]+["”’')\]]*|$)\s*/g;
    let m, buf = '';
    while ((m = re.exec(raw)) && m[0]) {
      buf += m[0];
      const next = raw.slice(re.lastIndex);
      const end = /[.!?]["”’')\]]*\s*$/.test(buf);
      // don't split after abbreviations or initials
      const abbr = /\b(Mr|Mrs|Dr|St|Sri|Śrī|Bg|SB|Cc|Ch|No|vs|e\.g|i\.e|etc|A|B|C|D)\.\s*$/.test(buf);
      if (!next || (end && !abbr && /^\s*(?:["“‘'(\[]|\/\/)?\s*[A-ZĀĪŪṚṢŚṆṬḌḤṀ]/.test(next))) { out.push(buf.trim()); buf = ''; }
    }
    if (buf.trim()) out.push(buf.trim());
    // a closing // that the split left at the start of the next sentence belongs to the one before
    for (let i = 1; i < out.length; i++) {
      const m = /^\/\/(?=\s|$)\s*/.exec(out[i]);
      if (m) { out[i - 1] += '//'; out[i] = out[i].slice(m[0].length); }
    }
    return out.filter(Boolean);
  }
  // Italics that open and never close (or the reverse) are dropped rather than shown as slashes
  const balance = (raw) => ((raw.match(/\/\//g) || []).length % 2 ? raw.replace(/\/\//g, '') : raw);

  function scoreText(p) {
    const len = p.length;
    const goods = (p.match(GOOD) || []).map((w) => w.toLowerCase());
    const distinct = new Set(goods).size;
    const bad = (p.match(BAD) || []).length;
    const digits = (p.match(/\d/g) || []).length;
    let s = Math.min(distinct, 7) * 2.4 + (goods.length - distinct) * 0.4 - bad * 4 - digits * 0.6;
    if (UNCLEAR.test(p)) s -= 12;
    if (MANTRA.test(p)) s -= 10;
    s -= ((p.match(PERSONAL) || []).length) * 1.5;
    s -= ((p.match(NAMES) || []).length) * 2;
    s -= ((p.match(HARSH) || []).length) * 2;
    if ((p.match(/\?/g) || []).length > 1) s -= 2;
    const dia = (p.match(/[āīūṛṝṣśṇṭḍḥṁṅñ]/gi) || []).length / Math.max(1, len);
    if (dia > 0.035) s -= (dia - 0.035) * 400;   // mostly Sanskrit: lovely, but not as the day's words
    if ((p.match(/["“”]/g) || []).length % 2) s -= 4;   // half a quotation
    s += Math.min(len, 420) / 90;
    if (len > 460) s -= (len - 460) / 60;
    return s;
  }

  // The best two or three sentences from the item, with where they sit in it
  function extract(doc, kind, opts) {
    const o = Object.assign({ max: 380, min: 110 }, opts);
    const blocks = doc.blocks;
    let total = 0;
    const at = blocks.map((b) => { const start = total; if (b.t === 'p') total += plain(b.raw).length; return start; });
    let best = null;
    blocks.forEach((b, i) => {
      if (b.t !== 'p') return;
      if (kind === 'spoken' && !/prabhup/i.test(b.who)) return;
      if (kind === 'books' && !/purport/i.test(b.sec)) return;
      const sents = sentences(stripRefs(b.raw)).map((raw) => ({ raw, txt: plain(raw) }));
      for (let a = 0; a < sents.length; a++) {
        if (OPEN.test(sents[a].txt) || WEAK_START.test(sents[a].txt) || sents[a].txt.length < 18) continue;
        let txt = '', raws = [];
        for (let z = a; z < Math.min(sents.length, a + 4); z++) {
          const t2 = txt ? txt + ' ' + sents[z].txt : sents[z].txt;
          if (t2.length > o.max) break;
          txt = t2; raws.push(sents[z].raw);
          if (txt.length < o.min) continue;
          let s = scoreText(txt);
          if (/[.!?]["”’')\]]*$/.test(txt) === false) s -= 3;
          if (SANSKRIT_LINE.test(raws[0]) || SANSKRIT_LINE.test(raws[raws.length - 1])) s -= 4;
          if (/\b(your letter|my letter|this letter|the letter|enclosed|herewith)\b/i.test(txt)) s -= 5;
          if (/\b(I|me|my)\b/.test(txt) && kind === 'letters' && !GOOD.test(txt)) s -= 1;
          GOOD.lastIndex = 0;
          if (!best || s > best.score) best = { score: s, raw: balance(raws.join(' ')), text: txt, block: i, pos: at[i], total };
        }
      }
    });
    if (!best) return null;
    best.ok = best.score >= (o.threshold != null ? o.threshold : 9);
    return best;
  }

  /* ---------- Books ---------- */
  function verse(doc) {
    const m = doc.meta, b = doc.blocks;
    const out = { ref: m.name || '', title: (m.title || '').replace(/\s+/g, ' '), label: m.label || '', deva: [], roman: [], translation: '', purport: [], synonyms: '' };
    let seenText = false;
    for (const x of b) {
      if (x.t === 'h' && x.level === 2) { if (/^text/i.test(x.text)) seenText = true; continue; }
      if (x.t === 'verse') {
        if (!seenText && /[ऀ-৿]/.test(x.lines.join(''))) out.deva = x.lines.map((l) => l.trim());
        else if (/^text/i.test(x.sec) && !out.roman.length) out.roman = x.lines.map((l) => l.trim());
        else if (/purport/i.test(x.sec)) out.purport.push({ verse: x.lines });
        continue;
      }
      if (x.t !== 'p') continue;
      if (/^translation/i.test(x.sec)) out.translation += (out.translation ? ' ' : '') + x.raw.replace(/^\*\*|\*\*$/g, '');
      else if (/^synonyms/i.test(x.sec)) out.synonyms += (out.synonyms ? ' ' : '') + x.raw;
      else if (/purport/i.test(x.sec)) out.purport.push({ raw: x.raw });
    }
    return out;
  }
  // "Bhagavad-gītā As It Is 2.47" → book and reference parts
  function bookRef(id, title) {
    const p = id.split('/');
    const book = p[0];
    const num = book === 'cc' ? p.slice(2).join('.') : p.slice(1).join('.');
    const name = book === 'bg' ? 'Bhagavad-gītā' : book === 'sb' ? 'Śrīmad-Bhāgavatam' : 'Śrī Caitanya-caritāmṛta';
    const part = book === 'cc' ? p[1].charAt(0).toUpperCase() + p[1].slice(1) + ' ' : '';
    return { book, name, ref: part + num, full: title || `${name} ${part}${num}` };
  }

  // The first sentences of the purport, for the verse cards
  function purportStart(v, max) {
    const first = v.purport.find((x) => x.raw && plain(x.raw).length > 40);
    if (!first) return '';
    const s = sentences(stripRefs(first.raw));
    let out = '';
    for (const x of s) { const t = out ? out + ' ' + x : x; if (plain(t).length > (max || 300) && out) break; out = t; }
    return out;
  }

  /* ---------- Listening ---------- */
  // Where in the recording a passage probably is: between the nearest time marks,
  // or in proportion to its place in the transcript when there are none.
  function jumpTime(doc, ex, duration) {
    if (!ex || !(duration > 0)) return 0;
    const marks = [{ pos: 0, s: 0 }];
    let total = 0;
    for (const b of doc.blocks) {
      if (b.t === 'p') total += plain(b.raw).length;
      if (b.t === 'time') marks.push({ pos: total, s: b.s });
    }
    marks.push({ pos: Math.max(total, 1), s: duration });
    let lo = marks[0], hi = marks[marks.length - 1];
    for (const mk of marks) { if (mk.pos <= ex.pos && mk.s >= lo.s) lo = mk; }
    for (let i = marks.length - 1; i >= 0; i--) { if (marks[i].pos >= ex.pos && marks[i].s >= lo.s && marks[i].s <= hi.s) hi = marks[i]; }
    const f = hi.pos > lo.pos ? (ex.pos - lo.pos) / (hi.pos - lo.pos) : 0;
    const t = lo.s + f * (hi.s - lo.s);
    return Math.max(0, Math.min(duration - 5, t - 8));   // start a little before, to catch the sentence's start
  }

  function cleanAudio(url, id) {
    return url && AUDIO_HOSTS.test(url) ? url : audioFor(id);
  }

  // Where a recording may be, best first. The VedaBase names its files after the same id
  // (721110SB.VRN.mp3); for 1966-1971 it often uses the place instead (690208BG-LOS_ANGELES.mp3).
  // The old library the transcripts point to comes last, in case it returns.
  function audioSources(it, own) {
    const id = it.id, y = yearOf(id);
    const VB = `https://vedabase.io/media/audio/transcripts/${y}/`;
    const coded = `${VB}${id.toUpperCase()}.mp3`;
    const named = [];
    const m = /^(\d{6}(?:-\d+)?)([a-z]+\d*)\./i.exec(id);
    if (m && it.place) {
      const pl = it.place.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (pl) {
        named.push(`${VB}${m[1]}${m[2].toUpperCase()}-${pl}.mp3`);
        if (/^NEW_/.test(pl)) named.push(`${VB}${m[1]}${m[2].toUpperCase()}-${pl.slice(4)}.mp3`);
      }
    }
    const old = cleanAudio(own, id);
    const list = (y <= 1971 ? named.concat(coded) : [coded].concat(named)).concat(old, old.replace('.nyc3.cdn.', '.nyc3.'));
    return list.filter((u, i) => list.indexOf(u) === i);
  }

  const mmss = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
  };

  const api = {
    SRC, urls, pageUrl, kindOf, audioFor, cleanAudio, audioSources, AUDIO_HOSTS,
    pad, ymd, mmdd, dayNumber, yearOf, dateOf, longDate, MONTHS, hash, rng,
    spokenInfo, letterInfo, dayItems, featuredOrder, bestOfYear, weight,
    decodeBooks, verseOfDay, randomVerse, bookRef, verse, purportStart,
    parse, plain, plainSmart, smart, inline, escHtml, stripRefs, sentences, extract, scoreText, jumpTime, mmss, sentenceCase,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Vani = api;
})(typeof self !== 'undefined' ? self : this);
