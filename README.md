<div align="center">

# Memora

**Study smarter, remember longer.**

An open-source study workspace that combines spaced repetition, an AI study
engine and the three mnemonic techniques taught in executive memory training —
in one fast, private desktop app.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black)
![Electron](https://img.shields.io/badge/Electron-desktop-47848f?logo=electron&logoColor=white)
![Tests](https://img.shields.io/badge/tests-139%20passing-4ade80)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## Why Memora

Most study apps help you *store* information. Memora is built around how memory
actually works:

- **Spaced repetition (SM-2)** schedules every card right before you'd forget it — the same algorithm behind Anki.
- **Active recall** everywhere: questions force retrieval, never recognition.
- **Mnemonic techniques built into every generated artifact** — not as tips, but woven into the material itself:

| Technique | How Memora applies it |
| --- | --- |
| 🏛️ **Method of loci** (memory palace) | Every key concept gets a vivid, spatially-anchorable image; study notes include a guided memory-palace walk per topic |
| 🧩 **Chunking** (Miller, 1956) | All generated material is organized in groups of 3–5 items — decks, note sections, study guides |
| 🔤 **Acronyms & acrostics** | Every list or sequence worth memorizing ships with a pronounceable first-letter mnemonic and its expansion |

## Features

**🃏 Flashcards that schedule themselves**
- SM-2 spaced repetition with a transparent, fully-tested scheduler
- Bulk import from pasted text, CSV, TSV or TXT with automatic delimiter detection
- Anki-compatible cloze deletion support

**🤖 AI Study Engine** *(local by default — Ollama installs itself; optional Claude API with your own key)*
- **Calibrated per subject** — pick your discipline (or let it auto-detect) and the engine adopts that field's exam-winning strategy: step-by-step proofs and worked examples for maths & physics, differential diagnosis and reference ranges for medicine, articles and *ratio legis* for law, lexical chunks and collocations for languages, chronology and cause-effect for the humanities, and more
- Turn **any file** into study material: PDF, Word, PowerPoint, Excel, images, plain text — Office files are parsed locally, nothing is uploaded anywhere except directly to the AI provider
- **Flashcards** with Bloom's-taxonomy tags, hierarchical topic tags, source citations and a mnemonic hook on every card
- **Structured notes**: Cornell-style layout, a **schematic concept map** rendered as mnemonic chunk-clusters, comparative tables, key-experiment boxes, exam-trap warnings, a memory-palace walk per topic and a bilingual glossary
- **Mock exams**: realistic multiple-choice tests with diagnostic distractors, difficulty calibration (30/50/20), clinical vignettes, automatic grading and a reasoned answer key
- **Extras**: study guides, oral-exam FAQs, topic timelines and podcast-style scripts
- **Download any material as PDF** — clean, print-ready export of cards, notes, exams and guides
- **Never cut off**: long generations continue automatically past the token limit, so notes and decks always finish
- **Source grounding**: with uploaded material, every claim is anchored to a page or slide reference
- **AI-graded free recall**: answer in your own words; the verdict drives the scheduler

**📊 Progress dashboard**
- Streaks, accuracy over time, due-date forecast and a transparent predicted exam score
- Hand-built SVG charts, zero chart dependencies

**👥 Work Groups**
- Create a study group and invite people with a **single link** — paste it, you're in
- **Live sync** (opt-in per group): chat, events and the leaderboard flow to every member's app in real time through a relay backend; the capability travels inside the invite link, no accounts
- **Group chat** with GIFs and meme stickers (KLIPY-powered), merging across members like everything else
- **Group events** on a mini calendar — one click adds them to Google Calendar (via the member's own Google login) or downloads an .ics for Apple Calendar/Outlook
- **Monthly leaderboard**: study points and constancy across *any* subject — sealed during the month, podium revealed on the 1st

> **Privacy note**: groups are local-first. A group only ever reaches the
> backend when a member turns on live sync; synced content is visible to the
> app operator for moderation (see `admin/dashboard.html`). Not end-to-end
> encrypted — say so to your users, and don't share secrets in group chat.

**🛟 Support**
- A Support button in the nav: pick a reason (bug, feature idea, help, inappropriate-content report, data issues, other), write, send
- Tickets land on the operator dashboard; replies come back as in-app notices — no email or account needed
- **Shared folders** of study material: notes, links and whole flashcard decks
- One-click "import into my decks" for shared decks
- Local-first sync: snapshots travel via invite links and export/import bundles
  and converge through union-merge — no account, no server, your data stays yours
  *(a realtime sync backend can plug into the same merge layer — see `workgroup.ts`)*

**⏱️ Student life**
- Pomodoro timer, quick notes, habit & mood tracker, budget tracker

**🔒 Private by design**
- No backend, no account, no telemetry — your data lives in local storage
- One-click JSON export of everything
- Your API key is stored locally and sent only to the AI provider

## Getting started

Requires **Node.js 18+**.

```bash
npm install
npm run dev        # dev server at http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | start the dev server |
| `npm run build` | type-check + production build |
| `npm test` | run all test suites (139 tests) |
| `npm run electron` | build and run the desktop app |
| `npm run package` | build the Windows installer |

### Two editions, one codebase

Memora ships in two flavours built from the same source — both branded simply
**Memora**:

- **private** (default) — the personal edition, dedications and rewards included.
- **social** — the same study workspace for friends: decks, dashboard,
  student life, AI and **fully compatible study groups** (invite links work
  across editions), but without the song of the day and the rewards shop.

The flag is baked in at build time: `vite build --mode social` reads
`.env.social` (`VITE_EDITION=social`) for the renderer, and
`electron-builder.social.json` injects `memoraEdition` into `package.json` for
the Electron main process. Distinct `appId`, package name (`memora-social`),
install folder and userData path keep the two editions fully separate even on
the same machine; artifacts carry a `-social-` suffix so downloads are
tellable apart. The social edition publishes releases to its own GitHub repo
(`memora-social`), so each edition auto-updates on its own channel. macOS
social builds include a **.pkg** one-click installer alongside dmg/zip.

| Command | What it does |
| --- | --- |
| `npm run dev:social` | dev server for the social edition |
| `npm run build:social` | type-check + production build (social) |
| `npm run package:social` | build the social Windows installer (`release-social/`) |
| `npm run release:social` | build + publish a social release to GitHub |

### GIF & sticker search (KLIPY key)

The group chat searches GIFs and meme stickers through
[KLIPY](https://klipy.com/developers) — built by ex-Tenor engineers with a
Tenor-compatible API (Google shut the Tenor API down on 2026-06-30, which is
why apps like Discord and WhatsApp migrated too). Keys are free and made to
be embedded in client apps:

1. Sign up at the [KLIPY Partner Panel](https://partner.klipy.com), go to **API Keys** and create your platform.
2. Add the key to a `.env` file in the repo root: `VITE_KLIPY_KEY=your-key`
3. Rebuild. Every packaged copy now ships with working GIF/sticker search.

Test keys are limited to 100 requests/hour — request production access from
the same panel before sharing the app widely. Without a key the picker still
lets people paste a direct image URL.

### The AI engine

The Study Engine runs **locally by default**: on first launch the desktop app
downloads and silently installs [Ollama](https://ollama.com), pulls a small
multimodal base model (`gemma3:4b`, ~3.3 GB, runs fine on a mid-range CPU) and
builds `memora-engine` on top of it — a specialised derivative with the app's
study-engine system prompt and tuned parameters baked in. Free, private, no
account, no key.

Prefer more horsepower? Open **Profile → AI engine**, switch to **Claude API**
and paste your [Anthropic API key](https://console.anthropic.com/settings/keys)
(also unlocks PDF ingestion).

> **Note:** browser-stored keys are appropriate for a personal desktop tool. If
> you deploy Memora for multiple users, put a small server-side proxy in front
> of the API instead.

## Architecture

A strict split between pure, fully-tested logic and a typed React UI:

```
src/
  engine.ts       # Study Engine core: quality standards + mnemonic directives
  claude.ts       # AI provider client + generation features
  files.ts        # any-file ingestion: PDF/images native, Office parsed locally
  sm2.ts          # SM-2 spaced-repetition scheduler        (24 tests)
  import.ts       # bulk-import parser                       (28 tests)
  stats.ts        # analytics: streaks, forecast, prediction (32 tests)
  life.ts         # pomodoro / habits / budget logic         (13 tests)
  workgroup.ts    # study groups: invite links + merge sync  (20 tests)
  storage.ts      # localStorage persistence + JSON export
  markdown.tsx    # dependency-free Markdown renderer (tables, code, quotes)
  App.tsx         # shell, navigation, deck + study views
```

TypeScript `strict` throughout. The UI language is currently Italian-first for
the AI-generated study material (the engine targets Italian university exams);
contributions for full i18n are welcome.

## Contributing

Issues and pull requests are welcome. The codebase is intentionally small,
dependency-light and thoroughly commented — a friendly place for a first
open-source contribution.

## License

[MIT](LICENSE)
