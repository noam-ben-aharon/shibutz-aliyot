# Aliyah Assignment App — Beit Knesset Netzach Banim
### Full technical & product handoff document — for the developer/agent continuing this project

> Target file: `index.html` — a single HTML file. No build step, no framework, no build-time dependencies.
> ~1,890 lines, ~60 functions, full Hebrew UI (RTL). Currently hosted on Netlify (drag & drop deploy).

---

## 1. Background & Purpose

A web app for a synagogue gabbai ("dad") to manage fair, automatic weekly assignment of the 7 Torah aliyot each Shabbat, matched to each congregant's reading ability, with full history, sharing tools (WhatsApp/print/copy), and congregant-roster management.

The end user (the gabbai) is **not technical** — every feature must be clear, forgiving of mistakes, and never require reading code to use.

**Key architectural decision, made deliberately:** a single HTML file (no React/Vue, no build tooling) so it can be drag-and-dropped onto Netlify with zero build chain. This is limiting but was an explicit user requirement ("the simplest possible, no accounts, no complications").

---

## 2. Overall Architecture

- **Vanilla JS**, no framework. Manual rendering: `render()` rebuilds `#app` from scratch on every state change (no virtual DOM/diffing — raw HTML strings via `innerHTML`, then manual `querySelector`/event wiring inside `setTimeout(...,0)` after render, to guarantee the elements already exist in the DOM).
- **Single global state object**: `STATE` (see section 4). Every mutation changes `STATE` then calls `render()`.
- **No router** — 4 tabs are managed via `STATE.tab` ('assign' | 'recent' | 'people' | 'parashot'), with `if(STATE.tab===...)` branches inside `render()`.
- **Modals** are each controlled by a dedicated STATE field (`editingCongregant`, `viewingHistory`, `editingParasha`, `manualWeekDraft`, `copyTextModal`, `confirmModal`, `noticeModal`, `printModal`) — non-null means "shown". The dispatcher in `render()` checks all of them and appends the relevant modal to `#content`.
- **Persistence**: all data goes through the `Store` abstraction (see section 5) — never directly against localStorage.

### File layout (roughly in this order):
1. `<head>`: meta tags, PWA manifest (**embedded as a data URI!**), icons (SVG data URIs), full `<style>` block.
2. `<body>`: `#app` (the SPA), `#printArea` (a separate, non-fixed-position element used only for print — see section 9).
3. `<script>`: everything lives here, roughly in this order:
   - Constants (HEB_LETTERS, ALIYAH_NAMES, PARASHOT_DEFAULT_TOTALS, PARASHOT_VERIFIED)
   - `defaultSplit()` — fallback even-split estimate
   - `STATE` object
   - date helpers, phone/WhatsApp helpers
   - `Store` (storage abstraction)
   - Hebcal calendar fetch functions
   - `loadAll()` + individual save* functions
   - backup export/import + CSV export
   - parasha-split logic (`getSplit`, `getStatus`, `getOverrideDiff`)
   - `getCongStats()` — **the core of all statistics, always derived from weeklyLog, never stored separately**
   - `seedData()` — the real 23-congregant roster loaded as the default on first run
   - **The assignment algorithm** (`fits`, `fairnessCompare`, `runAssignment`) — the product's core logic, see section 6
   - `confirmAssignment` / `doConfirmAssignment` / `updateLogAssignment`
   - UI-layer helpers: `askConfirm()`/`notice()` (custom modals replacing the browser's native `confirm()`/`alert()`!)
   - The main `render()` + dispatcher
   - `buildWeekPanels` / `buildWeekPanelsReadOnly` — builds the 7 aliyah cards (props: parasha, assign object, reasons)
   - 4 `render<Tab>Tab()` functions, one per tab
   - `render<X>Modal()` functions, one per modal
   - `loadAll()` call at the very end — the entry point.

---

## 3. Features — full list per tab

### "שיבוץ השבוע" (This Week's Assignment) tab — `renderAssignTab`
- Automatic reminder if more than 8 days have passed since the last confirmed assignment (or none exists yet).
- Parasha picker: 54 parashot + 7 combined pairs (61 options total).
- **Auto date from the Hebrew calendar** — not editable when the calendar loads successfully; falls back to a plain `<input type=date>` when the calendar fetch fails.
- "Lock a specific aliyah" card (optional) — before hitting START, the gabbai can pre-assign someone to a specific aliyah (e.g. a bar mitzvah), and the algorithm fairly fills the rest around that lock.
- "בצע שיבוץ" (Run Assignment) button triggers `runAssignment`.
- After running: editable cards per aliyah (a `<select>` each, including a "👤 Guest" option with a free-text name), with warnings (over/under capability, duplicate assignment).
- Action buttons: confirm assignment, copy as text, print, reset assignments.
- Picking a different parasha while a draft is open **discards the draft** (with a warning) — this was fixed after being discovered as a bug (the selection used to visually "stick").

### "ארכיון עליות" (Aliyah Archive) tab — `renderRecentTab` — formerly "עליות אחרונות" (Recent Aliyot)
- **All weeks** (no longer capped at the last 4), sorted newest-first.
- **Search field** (by parasha name or date).
- Each week displays as a **collapsed block** (just parasha + date + how many aliyot filled) — click to expand/collapse.
- Default view is **read-only** (`buildWeekPanelsReadOnly`). To edit, the user must explicitly click "✏️ עריכת שיבוץ" (Edit Assignment) — prevents accidental changes.
- "+ הוסף שבת עבר ידנית" (Add a past week manually) button — for backfilling history predating app usage; auto-fills the parasha + the real Hebrew-calendar date of the most recent past Shabbat (or whichever parasha is picked).
- **Real duplicate-assignment prevention**: if an entry already exists for the same parasha+date, the user is asked "update (overwrite)?" — yes deletes the old entry and inserts the new one, no cancels entirely (a duplicate can never be created).

### "מתפללים" (Congregants) tab — `renderPeopleTab`
- Add/edit/delete a congregant: name, "קורא חזק" (Strong Reader) checkbox, max pasuk range, phone (with the **Contact Picker API** for picking directly from the phone's contacts — Android/Chrome only, with a graceful fallback message on iOS).
- Sort: alphabetical / longest-since-last-read.
- "⚠ above/below average" tag — flags a congregant reading far more/less than average (a sign of a "bottleneck" in the percentage-tolerance range — see section 6.2).
- Pause/unpause (not deleted, just excluded from the automatic rotation).
- **⬇ Export backup** (full JSON: congregants + history + settings), **⬆ Import backup**, **📊 Export history to CSV** (one-way, for spreadsheet analysis only).
- **No longer has** a "sync with code roster" button — explicitly removed at the user's request; the roster is now managed **only** manually via the app.

### "פרשות ועליות" (Parashot & Aliyot) tab — `renderParashotTab`
- **Matching settings**: the percentage range (default 80%-110%, editable) that determines when an aliyah "fits" a normal reader.
- **WhatsApp message template**: free text with 4 auto-replaced placeholders: `{שם}` (name) `{עלייה}` (aliyah) `{פרשה}` (parasha) `{סרטון}` (video — a YouTube search link for the "Nir Gahali" channel, Yemenite/Shami nusach, scoped to that specific parasha+aliyah; not an exact DB — it's a search link, since the 378 individual videos couldn't be cataloged via web_fetch).
- A table of all 61 options (54+7) with: total verse count, actual aliyah split, status (verified✓ / manually overridden / estimated), notes (exactly what differs from the default), and an edit button.

---

## 4. Data Model (STATE)

```js
STATE = {
  tab: 'assign',
  congregants: [],  // schema below
  weeklyLog: [],    // the SINGLE source of truth for all history — see section 4.2
  parashot: {},     // name -> [7 numbers], manual override only (falls back to PARASHOT_VERIFIED/defaultSplit if absent)
  current: null,    // active assignment draft: {date, parasha, assign, deferred, unfilledReasons, confirmed:false}
  matchSettings: {lower:80, upper:110},
  whatsappTemplate: null,  // null = use DEFAULT_WHATSAPP_TEMPLATE
  suggestedParasha: null,  // {name, date} — from the Hebrew calendar
  parashaCalendar: [],     // every parasha from 380 days ago through 200 days ahead (see section 7)
  calendarStatus: 'loading'|'ok'|'error',
  // + several UI-ephemeral fields: pendingParasha, pendingDate, pendingLocks, editingWeekId,
  //   expandedWeekIds, recentSearch, peopleSortMode, and all the modal fields (see section 2)
}
```

### 4.1 Congregant schema
```js
{
  id: "c...",           // unique id
  name: "יצחק עוקב",
  level: 25,             // max pasuk range; 100 = placeholder value for a strong reader (never actually checked)
  unrestricted: false,   // true = "Strong Reader" — completely bypasses the range mechanism (see fits())
  baseTotal: 0,          // legacy: "prior" aliyot no longer editable from the UI, but still counted if !=0
  phone: "",             // optional, for WhatsApp
  paused: false          // optional; excluded from the automatic rotation if true
}
```
⚠️ **Critical note**: `baseTotal` was **deliberately removed from the UI** (the user asked for this to be fully automatic, not manual). The field still exists in the data model for backward compatibility and is still counted in `getCongStats`, but there is no longer any way to enter it through the interface (only via importing an old backup). **Do not re-add a manual input for this without checking with the user first** — this was an explicit request.

### 4.2 Week entry schema in weeklyLog (**the single source of truth**)
```js
{
  id: "w...",
  date: "YYYY-MM-DD",
  parasha: "ואתחנן",
  assign: { "1": "c3", "2": "guest:יוסי מירושלים", "4": "c7" /* ... */ },
  // keys = aliyah number (1-7) as a STRING (not all are always present — an unassigned aliyah is simply missing from the object!)
  // a value starting with "guest:" = a one-off guest reader; the name after ":" is free text, does NOT reference a congregant record
  deferred: ["c9", "c14"],       // who was deferred that week (internal bookkeeping only, no longer shown in the UI)
  unfilledReasons: {"2": "..."}  // a textual explanation for why a specific aliyah was left empty
}
```

**Deliberate and critical design choice:** there is nowhere else that "total aliyot" or "last aliyah" are stored! `getCongStats(id)` **always** scans the entire `weeklyLog` and counts. This means:
- Editing/deleting a week in the archive **automatically** updates everyone's stats, with no manual sync step.
- **There is no total-vs-reality drift possible** — because no "total" is ever stored on its own.
- Performance: O(congregants × weeklyLog × 7) on every render of the people tab. With hundreds of weeks this could get slow — **a candidate for future optimization** (memoization/caching) if the archive grows substantially.

---

## 5. Storage Layer (`Store`)

```js
const hasClaudeStorage = (typeof window!=='undefined' && !!window.storage);
const Store = {
  async get(key){ /* window.storage.get if it exists, else localStorage */ },
  async set(key, value){ /* same idea */ }
};
```

**Background**: during development (inside Claude's preview), a `window.storage` API is available. After a standalone deploy (Netlify etc.) it doesn't exist, so there's a transparent fallback to `localStorage`. A **prefix** of `shibutz-aliyot:` is added to every localStorage key to avoid collisions.

**Known, user-acknowledged limitation**: `localStorage` is per-device/per-browser. **There is no cross-device sync** (Firebase was considered as a future option but never built — the user chose to accept "always from the same phone" instead).

Stored keys: `congregants`, `weeklyLog`, `parashot`, `current`, `matchSettings`, `whatsappTemplate`.

---

## 6. The Assignment Algorithm (`runAssignment`) — the product's core

This is the most heavily-engineered part of the app, after many iterations with the user. **Do not change this without fully understanding it** — we went through several real debugging rounds here.

### 6.1 Principles agreed with the user (in priority order):
1. **Fairness first** — whoever has read the fewest total times (`total`, derived, see 4.2) gets priority. **Not** "longest since last read" — total-count-based, not recency-based (this distinction was explicitly clarified with the user when they suspected a bug — see also 6.2).
2. **Range matching** — a "normal" reader only gets an aliyah within `[level×lower%, level×upper%]` (`matchSettings`, default 80-110%, later widened by the user to 75-120% and beyond). **Not** "anything up to level" — deliberately, so as not to "waste" a strong normal reader on a short aliyah.
3. **"Strong Reader"** (`unrestricted:true`) — `fits()` always returns `true`. Always gets the **longest aliyah remaining**, but **only** when no normal reader can cover it at all (see 6.3) — not simply "whatever normal readers didn't want."
4. **Manual locks** (`locks` param) — injected into `assign` before the run; the locked congregant is excluded from strongPool/normalPool so they're never double-counted.
5. **Preventing the same person from getting two aliyot in the same week** — enforced at the UI level (options are actually `disabled` in the `<select>`, not just a warning) via `assignedAliyahOf` inside `buildWeekPanels`.

### 6.2 A "bug that wasn't a bug" — worth documenting
The user reported: "dad assigned someone who had read just two weeks ago." **I ran a 60-week simulation** (see conversation history for the exact code — reproducible by extracting the pure logic from the file and running it in Node) and found zero fairness violations. **Conclusion**: this is a legitimate "bottleneck" phenomenon — if only one congregant covers a rare pasuk-count range (e.g. 8-11), they **must** be reassigned repeatedly over time, because there is no alternative. The recommended fix (proposed to the user): widening `matchSettings` (a broader percentage range) significantly reduces this (tested: 80-110% → a spread of 24 between the most- and least-read normal congregant; 65-130% → a spread of 11). The **"⚠ above/below average" tag** on the people tab is a built-in diagnostic tool for exactly this phenomenon.

### 6.3 The exact sequence of operations
```
1. split = getSplit(parashaName)  // an array of 7 numbers (pesukim per aliyah)
2. assign = {...locks}            // locks applied first
3. remaining = the 7 aliyot that weren't locked, sorted hardest (most pesukim) to easiest
4. strongPool, normalPool = non-paused, non-locked congregants, sorted by fairnessCompare
5. maxNormalCeiling = the highest pesukim count *any* normal reader in the community could ever take (not just those free right now)
6. for each aliyah in remaining (hardest to easiest):
   a. look through normalPool (in fairness order) for the first one who fits and isn't used yet → assign, break inner loop
   b. if none found AND this aliyah's pesukim > maxNormalCeiling → take the first available strongPool reader → assign
   c. otherwise (not too hard, there just isn't a fitting normal reader available right now) → leave it empty + unfilledReasons[i] = a textual explanation
7. deferred = normal readers who weren't assigned AND whose range doesn't cover any aliyah in this parasha at all
```

**A subtle but important point**: in 6.a, `.find()` stops at the **first** match, not the "best" one. This is **intentional** — it was explicitly explained to the user: "it's not aiming for 100% of someone's capacity, fairness is the primary axis, matching is just a yes/no gate." The user confirmed they want to keep it that way.

### 6.4 `fits(person, pesukim)`
```js
if(person.unrestricted) return true;
const min = person.level * (matchSettings.lower/100);
const max = person.level * (matchSettings.upper/100);
return pesukim >= min-1e-6 && pesukim <= max+1e-6;
```

### 6.5 `fairnessCompare(a,b)`
```js
1. lower total comes first (from getCongStats)
2. tie → whoever has never read (lastEntry===null) comes first
3. still tied → Math.random()-0.5 (random, so re-running START gives variation)
```

---

## 7. Hebrew Calendar Integration (Hebcal)

**Two methods, with fallback**:
1. **Primary**: a direct `fetch()` to Hebcal's public REST API (`hebcal.com/hebcal?cfg=json...`) — a range from 380 days in the past through 200 days ahead, **always following the Israel (not Diaspora) custom** (`i=on`).
2. **Fallback**: the `@hebcal/core` library via a dynamic `import()` from jsdelivr (`fetchViaHebcalLibrary`).

**⚠️ Critical to understand**: inside Claude's preview (during development), **both methods fail** (the sandbox blocks outbound network requests, and also `window.print()`, `window.confirm()`, `navigator.clipboard`, etc.). **This is not a code bug** — it was verified and explained to the user repeatedly. **In a real deployment** (Netlify) all of this is expected to work normally. **Don't assume something is "broken" without first checking in a real production environment**, not just the preview.

Because of the repeated sandbox-blocking issue, **self-contained replacements** were built for every "risky" browser API:
- `askConfirm()`/`notice()` — replace `confirm()`/`alert()` (our own custom modals).
- The print modal uses a `#printArea` element (**not** `position:fixed` — we discovered that printing fixed-position elements is unreliable across browsers, and caused a blank second page).
- The copy modal uses a `<textarea readonly>` that's auto-selected, as a fallback to `navigator.clipboard`.

`getDateForParasha(name)` returns the nearest **future** date; `getPastDateForParasha(name)` returns the nearest **past** date (used for "add a past week").

---

## 8. Parasha Data (`PARASHOT_VERIFIED`)

Source: thorough manual research cross-checked against Hebcal/Sefaria/Artscroll for **all 54 parashot** + **6 of the 7 combined pairs** (Chukat-Balak was **removed** — not relevant to this synagogue's custom, see conversation history for details).

```js
PARASHOT_VERIFIED = { "בראשית": [34,16,27,21,4,28,16], ... }  // 7 numbers = pesukim per aliyah
```

- `getSplit(name)`: if there's a manual override in `STATE.parashot[name]` → use it. Otherwise, if present in `PARASHOT_VERIFIED` → use that. Otherwise `defaultSplit(total)` (an even-split estimate, labeled "Estimated — not yet verified").
- `getStatus(name)`: determines the tag (Verified✓ / Manually Overridden / Estimated) by **actually comparing values**, not just "does an override exist" — meaning if the user edits a value and then sets it back to exactly the original, the status automatically reverts to "Verified✓" (`getOverrideDiff` does an exact diff).
- **Important historical note**: the rules for "which pairs combine in which year" **are not simple** (not just "leap year vs. regular year") — this was researched in depth during the conversation: Behar-Bechukotai actually separate in the *majority* of years in Israel; Nitzavim-Vayeilech depends on which day of the week Rosh Hashana falls on, not the type of year; Chukat-Balak depends on Pesach falling on a Thursday, and only applies in the Diaspora. **Do not assume a simple rule** if you want to add auto-detection logic for the combined pairs.

---

## 9. Print

`printWeek()` is **async** (it awaits `getHebrewDateString()` — an additional fetch call to Hebcal's date-converter API). The content is written **both** to `STATE.printModal` (for the on-screen preview modal) **and** directly into `#printArea` (a separate DOM element, `display:none` by default, switched to `display:block` only under `@media print`).

**Bug history worth learning from**:
1. Printing a `position:fixed` modal → a blank second page. **Fix**: `#printArea` is non-fixed, in normal document flow.
2. `body` padding wasn't reset for print → contributed to the blank second page. **Fix**: `@media print { html,body{padding:0!important;margin:0!important} }` + `@page{margin:1.2cm}`.
3. Gregorian date → replaced with the real Hebrew date (`getHebrewDateString`, falls back to Gregorian if the fetch fails).
4. The per-aliyah letter badges (א-ז) were removed — the user asked for a simpler table.
5. Font sizes were substantially increased for readability by older congregants (reader's name: 28px, parasha name: 46px).

---

## 10. PWA (Installable as an App)

The manifest + icons are **embedded as data URIs directly in the `<head>`** (not separate files!) — to preserve the "single file" property even with a PWA. Built with a Python/base64 script (see conversation history for the exact script if the icon needs to change). `display:"standalone"`, `theme_color` matches the site's palette.

---

## 11. Design System

Palette (CSS custom properties in `:root`): parchment/gold/claret tones inspired by a Torah scroll. Fonts: `Frank Ruhl Libre` (headings) + `Assistant` (body), loaded from Google Fonts. Signature element: a "seal" — a claret-and-gold circle with the Hebrew letter (א-ז) for each aliyah, repeated throughout the site. Header mark: a hand-drawn SVG Torah scroll (rods + parchment + text lines).

**Mobile-layout safeguards built after several real bugs** (important to preserve):
```css
html, body{ overflow-x:hidden; max-width:100vw; }  /* prevents the whole page from "expanding" and requiring zoom/rotation */
.card{ overflow-x:auto; }   /* wide tables scroll within the card instead of breaking the page */
.modal{ overflow-x:auto; }  /* same for modals */
```
**Critical lesson learned**: any `row-flex`/flex-row containing a **non-div element** (e.g. a `<button>` placed directly, not wrapped in a `<div>`) **does not receive** the `.row-flex > div{flex:1;min-width:160px}` rule, causing it to "insist" on its natural width and overflow. **Always wrap buttons in a `<div>` inside a row-flex, or make sure any new container with non-fixed width has `flex-wrap:wrap`.**

---

## 12. Things Explicitly Decided AGAINST (don't re-propose without new context)

- **Cross-device sync** (Firebase etc.) — rejected; the user chose localStorage + "always the same phone."
- **A manual `baseTotal` field in the UI** — deliberately removed, see 4.1.
- **The "sync with code roster" button** — removed entirely; the user wants full manual control over the roster.
- **Chukat-Balak as an automatically-combined pair** — removed; not relevant to this specific synagogue's custom.
- **An exact catalog of all 378 YouTube videos** (parasha × aliyah) — not done (not scrapable via web_fetch, YouTube is JS-rendered); the chosen solution is a **search** link, not a precise direct link.

---

## 13. Follow-up Ideas Already Raised But Not Implemented (real backlog)

- ✅ = done, ⬜ = not done yet
- ⬜ Remove the "📱 Send to them" buttons from the "lock a specific aliyah" card (before START) — not relevant there, purely cosmetic noise.
- ⬜ Performance optimization for `getCongStats` if the archive grows very large (currently O(n×m), see section 4.2).
- ⬜ An exact YouTube link database (if the user/someone manually collects real playlist IDs from the channel).
- ⬜ Real production testing for every fetch-dependent feature (Hebrew calendar, Hebrew print date) — so far only partially verified by the user after deploying.
- ⬜ Consider caching `STATE.parashaCalendar` across sessions (currently reloaded on every page load).

---

## 14. Deployment

- **Netlify Drop**, with an account (not anonymous — anonymous deploys get deleted after an hour!).
- **⚠️ Critical**: the file **must be named exactly `index.html`**, otherwise the root URL 404s. This was a real issue the user actually hit.
- Updates: **drag onto the same existing project** (not the general `/drop` page — that creates a brand new, separate project/URL!) to keep the same URL.
- localStorage data is **not affected** by a redeploy (it lives in the browser, not in the file).

---

## 15. How to Verify Nothing Broke (manual regression-testing guide)

There are no automated tests in this project. Before any significant change, it's recommended to:
1. Extract the pure JS portion (everything up to the string `// ---------- rendering ----------`) and run it in Node with stubs for `window`/`render`, to test logic without the DOM (this is how the algorithm was validated across 60 simulated weeks — see section 6.2).
2. `node --check` on the extracted JS is enough to catch syntax errors (a missing comma in the STATE object caused this several times!).
3. Manually check all 3 tabs + every modal after any CSS change, **in portrait mode on a real phone** — not just a desktop preview.

---

*This document was written at the end of a very long conversation (weeks of iterative work with the real end-user/gabbai). Every section here represents at least a few rounds of real feedback. Preserve this context — several decisions (e.g. 6.3, 12) look "unintuitive" without the background.*


אני רוצה לקחת את הרעיון הזה כמה צעדים קדימה
מכל הבחינות וההיבטים
מצרף לך גם את הקישור לאתר הקיים כדי שתעיין ותחווה דעה עליו

https://nezach-banim-shibutz.netlify.app/