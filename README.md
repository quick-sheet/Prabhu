# Vani

Srila Prabhupada's words for today: a verse, a letter, his voice.

A quiet, one-page phone app for a few friends. Each day it opens on a moment from his life on that date (a lecture, a morning walk, a conversation or a letter, chosen the same way on every phone), a verse from the Bhagavad-gītā, and a book you can open at any page. Where a recording exists, you can hear him.

Live at: https://quick-sheet.github.io/Vani/

## Where the words come from

Vani's repository holds code only. The words are read live, on the phone, from the open vani.wiki archive on GitHub:

- Books (original pre-1978 editions): https://github.com/vaniwiki/prabhupada-books
- Lectures, walks and conversations: https://github.com/iskconpress/spoken
- Letters: https://github.com/vaniwiki/prabhupada-letters
- Recordings: the archive's audio library

`index.json` and `books.json` list only names, dates, places and lengths, so the app knows what exists on each date. `build-index.py` rebuilds them from fresh clones of the archive.

His words © The Bhaktivedanta Book Trust.

## The shared code

New phones are asked for a code. It is a soft door for friends, not a lock. The code is **1896**.

- Share link that skips the code box: `https://quick-sheet.github.io/Vani/#k=1896`
- To change it, compute the SHA-256 of `vani:` plus the new code and put it in `CODE_HASH` near the top of the script in `index.html`.

## Install

- **Android (Chrome):** open the live URL and tap **Install** in the welcome, or Chrome ⋮ → **Install app**. Open it from its home-screen icon.
- **iPhone (Safari):** open the live URL, tap **Share** (on iOS 26 it's under the ⋯ beside the address bar), then **Add to Home Screen**, keep **Open as Web App** on, tap **Add**. Always open it from the icon.

## Update

1. **Add file → Upload files**, choose the changed files, **Commit changes**.
2. Wait about a minute.
3. Fully close the app and reopen it.

Every release bumps both markers together: `core.js?v=N` in `index.html` and `vani-vN` in `sw.js`.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The whole experience: layout, styles and app script |
| `core.js` | Reading the archive's text, choosing the day's words, finding a passage (no DOM; tested in Node) |
| `sw.js` | Offline support and instant updates |
| `index.json`, `books.json` | What exists on each date, and every verse's path |
| `manifest.webmanifest`, icons | Installing to the home screen |
| `build-index.py` | Rebuilds the two index files |

## Good to know

- **Offline:** texts are kept on the phone once read, and tomorrow's are read ahead, so Vani usually opens without a connection. Recordings need a connection.
- **Sound:** the tanpura drone and the small bells are made on the phone. Turn the drone off with the wave icon at the top; touch sounds are in Settings.
- **Kept passages** stay on that phone only.
- **Android quirk:** if every launch plays a sound and shows a Chrome notification saying "Tap to copy the URL for this app", long-press that notification and turn off the **Full screen site controls** category. The app can't switch it off itself.
