// Brutal Edge-Case, Stress, & Vulnerability Test Suite for Shibutz Aliyot
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) {
  console.error('Could not find <script> in index.html');
  process.exit(1);
}

let jsCode = match[1];
// Strip the final loadAll(); so we can control execution in Node
jsCode = jsCode.replace(/loadAll\(\);\s*$/, '');

// Minimal DOM & Browser shim so we can also test DOM rendering & modal/input escaping!
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.classList = { add() {}, remove() {}, contains() { return false; } };
  }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { return child; }
  get firstElementChild() { return new FakeElement(); }
  querySelector() { return new FakeElement(); }
  querySelectorAll() { return []; }
  focus() {}
  select() {}
  click() {}
}

global.window = {
  storage: {
    _data: {},
    async get(k) { return this._data[k] ? { key: k, value: this._data[k] } : null; },
    async set(k, v) { this._data[k] = v; return { key: k, value: v }; }
  },
  open() {},
  print() {}
};
global.localStorage = {
  _data: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
  setItem(k, v) { this._data[k] = String(v); }
};
global.document = {
  activeElement: null,
  getElementById(id) {
    if (!this._els) this._els = {};
    if (!this._els[id]) this._els[id] = new FakeElement('div');
    return this._els[id];
  },
  querySelectorAll() { return []; },
  createElement(tag) { return new FakeElement(tag); },
  body: new FakeElement('body')
};
global.navigator = { clipboard: { async writeText() {} } };
global.Blob = class Blob { constructor(parts) { this.parts = parts; } };
global.URL = { createObjectURL() { return 'blob:fake'; }, revokeObjectURL() {} };

const runnerPath = path.join(__dirname, '_run_brutal.js');

const testSuiteCode = `
let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log('  ✅ PASS:', name);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log('  ❌ FAIL:', name, detail ? '--> ' + detail : '');
  }
}

function resetCleanState() {
  const seed = seedData();
  STATE.congregants = JSON.parse(JSON.stringify(seed.congregants));
  STATE.weeklyLog = [];
  STATE.parashot = {};
  STATE.current = null;
  STATE.pendingLocks = {};
  STATE.matchSettings = { lower: 65, upper: 130, strongMin: 30 };
  STATE.whatsappTemplate = null;
  STATE.loaded = true;
  invalidateStatsCache();
}

console.log('\\n======================================================');
console.log('🔥 RUNNING BRUTAL EDGE-CASE & VULNERABILITY SUITE 🔥');
console.log('======================================================\\n');

// ---------------------------------------------------------------------------
// 1. EXTREME ROSTER BOUNDARY CONDITIONS
// ---------------------------------------------------------------------------
console.log('--- 1. Extreme Roster Boundary Conditions ---');
{
  // 1a. Empty roster (0 congregants)
  resetCleanState();
  STATE.congregants = [];
  invalidateStatsCache();
  let crashed = false;
  try {
    runAssignment('בראשית', '2026-10-10', {});
  } catch (e) {
    crashed = true;
  }
  check('1a. Empty roster (0 congregants) does not crash runAssignment', !crashed && STATE.current && countFilled(STATE.current.assign) === 0);

  // 1b. All congregants paused
  resetCleanState();
  STATE.congregants.forEach(c => c.paused = true);
  invalidateStatsCache();
  runAssignment('בראשית', '2026-10-10', {});
  check('1b. All congregants paused -> 0 assigned, 7 unfilledReasons generated',
    countFilled(STATE.current.assign) === 0 && Object.keys(STATE.current.unfilledReasons).length === 7);

  // 1c. Only 1 active normal congregant
  resetCleanState();
  STATE.congregants.forEach((c, idx) => { if (idx > 0) c.paused = true; });
  invalidateStatsCache();
  runAssignment('בראשית', '2026-10-10', {});
  check('1c. Single active normal congregant (level 25) gets exactly 1 fitting aliyah, never duplicated',
    countFilled(STATE.current.assign) === 1);

  // 1d. Only strong readers in roster (5 strong readers, 0 normal)
  resetCleanState();
  STATE.congregants = STATE.congregants.filter(c => c.unrestricted);
  invalidateStatsCache();
  runAssignment('בראשית', '2026-10-10', {});
  const assignedVals = Object.values(STATE.current.assign);
  const uniqueVals = new Set(assignedVals);
  check('1d. Only 5 strong readers -> exactly 5 aliyot filled, 0 duplicates',
    assignedVals.length === 5 && uniqueVals.size === 5);

  // 1e. Only normal readers (0 strong readers) on a parasha with a giant 72-pasuk aliyah (מטות-מסעי)
  resetCleanState();
  STATE.congregants = STATE.congregants.filter(c => !c.unrestricted);
  invalidateStatsCache();
  runAssignment('מטות-מסעי', '2026-07-18', {});
  check('1e. 0 strong readers on מטות-מסעי (72-pasuk aliyah #4) leaves #4 unfilled with accurate reason',
    !STATE.current.assign[4] && (STATE.current.unfilledReasons[4] || '').includes('חורגת מיכולת כל מתפלל רגיל'));
}

// ---------------------------------------------------------------------------
// 2. LOCKS, GUESTS, & DUPLICATE LOCK PROTECTION
// ---------------------------------------------------------------------------
console.log('\\n--- 2. Locks, Guests, & Duplicate Lock Protection ---');
{
  resetCleanState();
  // Lock all 7 aliyot to guests
  const allGuestLocks = {
    1: 'guest:אורח א', 2: 'guest:אורח ב', 3: 'guest:אורח ג',
    4: 'guest:אורח ד', 5: 'guest:אורח ה', 6: 'guest:אורח ו', 7: 'guest:אורח ז'
  };
  runAssignment('נח', '2026-10-17', allGuestLocks);
  check('2a. All 7 aliyot locked to guests works cleanly without crashing',
    countFilled(STATE.current.assign) === 7 && Object.values(STATE.current.assign).every(v => v.startsWith('guest:')));

  // Duplicate lock protection: what if locks object accidentally has the same congregant in 2 slots?
  resetCleanState();
  runAssignment('נח', '2026-10-17', { 1: 'c1', 2: 'c1' });
  const c1Count = Object.values(STATE.current.assign).filter(v => v === 'c1').length;
  check('2b. Duplicate congregant lock {1: c1, 2: c1} is deduplicated so c1 never appears twice in the same Shabbat',
    c1Count === 1, 'c1 appeared ' + c1Count + ' times');
}

// ---------------------------------------------------------------------------
// 3. RECENCY & SAME-PARASHA / COMBINED-SPLIT OVERLAP EDGE CASES
// ---------------------------------------------------------------------------
console.log('\\n--- 3. Recency & Same-Parasha / Combined-Split Overlap Edge Cases ---');
{
  // 3a. Same parasha run again a few days later (e.g. gabbai logs part of a parasha or re-runs same parasha on a different date)
  resetCleanState();
  runAssignment('בראשית', '2026-10-10', {});
  const firstWeekReaders = Object.values(STATE.current.assign);
  doConfirmAssignment();
  // Now run 'בראשית' again 1 day later (2026-10-11)
  runAssignment('בראשית', '2026-10-11', {});
  const secondWeekReaders = Object.values(STATE.current.assign);
  const overlapRecentSameParasha = secondWeekReaders.filter(id => firstWeekReaders.includes(id));
  check('3a. Running the SAME parasha within the same week/month blocks whoever just read it (gap != 54)',
    overlapRecentSameParasha.length === 0,
    'Overlapping readers on recent same-parasha: ' + overlapRecentSameParasha.join(', '));

  // 3b. Same parasha 1 full year later (> 300 days later) SHOULD be allowed (gap = 54)
  resetCleanState();
  STATE.weeklyLog.push({
    id: 'w_old',
    date: '2025-10-18',
    parasha: 'בראשית',
    assign: { 1: 'c1', 2: 'c2', 3: 'c3', 4: 'c4', 5: 'c5', 6: 'c6', 7: 'c7' },
    deferred: []
  });
  invalidateStatsCache();
  const c1BlockedAfterYear = isRecencyBlocked(getCongStats('c1'), 'בראשית', '2026-10-10');
  check('3b. Reading the same parasha 1 year later (>300 days) is NOT recency-blocked',
    !c1BlockedAfterYear);

  // 3c. Overlapping combined/split parasha (e.g. someone read "ויקהל" and then "ויקהל-פקודי" is selected, or "פקודי" then "ויקהל-פקודי")
  resetCleanState();
  STATE.weeklyLog.push({
    id: 'w_vayakhel',
    date: '2026-03-07',
    parasha: 'ויקהל',
    assign: { 1: 'c1' },
    deferred: []
  });
  invalidateStatsCache();
  check('3c. Reading "ויקהל" blocks reading "ויקהל-פקודי" in the same season',
    isRecencyBlocked(getCongStats('c1'), 'ויקהל-פקודי', '2026-03-14'));
}

// ---------------------------------------------------------------------------
// 4. EXPLAIN_QUEUE_PERSON CONSISTENCY (NO CONTRADICTORY EXPLANATIONS)
// ---------------------------------------------------------------------------
console.log('\\n--- 4. explainQueuePerson Mathematical Consistency Across 200 Weeks ---');
{
  resetCleanState();
  let contradictions = [];
  for (let w = 0; w < 200; w++) {
    const pName = PARASHA_ORDER[w % 54];
    const d = new Date(2026, 0, 3 + w * 7).toISOString().slice(0, 10);
    // Occasionally lock a high-total reader on aliyah 1 to test locked-slot explanation too
    const locks = (w % 25 === 0) ? { 1: 'c1' } : {};
    runAssignment(pName, d, locks);
    const liveStats = buildStatsMap();
    const split = getSplit(pName);
    for (const c of STATE.congregants) {
      if (c.paused) continue;
      const info = explainQueuePerson(c, STATE.current, split, liveStats);
      if (info && !info.selected && info.reason) {
        // Check if reason claims "X עליות אז, לעומת Y שלו — קודם לו בתור ההוגנות" where X > Y!
        const m = info.reason.match(/\\((\\d+) עליות אז, לעומת (\\d+) שלו — קודם לו בתור ההוגנות\\)/);
        if (m) {
          const winnerTotal = parseInt(m[1], 10);
          const myTotal = parseInt(m[2], 10);
          if (winnerTotal > myTotal) {
            contradictions.push(\`Week \${w} (\${pName}): for \${c.name} (total \${myTotal}), reason claimed winner had \${winnerTotal} reads yet was ahead in queue: "\${info.reason}"\`);
          }
        }
      }
    }
    doConfirmAssignment();
  }
  check('4. Zero contradictory "ahead in queue" explanations across 200 weeks of swaps/strong-priority/locks',
    contradictions.length === 0,
    contradictions.slice(0, 2).join(' | '));
}

// ---------------------------------------------------------------------------
// 5. HTML ATTRIBUTE INJECTION / DOUBLE-QUOTE ESCAPING IN HEBREW NAMES
// ---------------------------------------------------------------------------
console.log('\\n--- 5. HTML Escaping for Hebrew Names with Quotes (ד"ר, כ"ץ, שליט"א) ---');
{
  resetCleanState();
  STATE.congregants[0].name = 'ד"ר משה כ"ץ';
  STATE.editingCongregant = STATE.congregants[0].id;
  const modalHtml = renderCongregantModal().innerHTML;
  // If unescaped, value="ד"ר משה כ"ץ" breaks right after ד!
  const hasBrokenAttr = modalHtml.includes('value="ד"ר');
  check('5a. renderCongregantModal properly escapes double quotes in congregant name (ד"ר משה כ"ץ)',
    !hasBrokenAttr && modalHtml.includes('&quot;'),
    hasBrokenAttr ? 'Found unescaped value="ד"ר in modal HTML!' : '');
  STATE.editingCongregant = null;

  // Guest name with quotes in buildWeekPanels
  const panelsHtml = buildWeekPanels('בראשית', { 1: 'guest:אורח של משפחת כ"ץ' }, {}, {});
  const hasBrokenGuestAttr = panelsHtml.includes('value="אורח של משפחת כ"ץ"');
  check('5b. buildWeekPanels properly escapes double quotes in guest input value',
    !hasBrokenGuestAttr && panelsHtml.includes('&quot;'),
    hasBrokenGuestAttr ? 'Found unescaped guestName value attribute!' : '');

  // Search input with quotes in renderPeopleTab & renderRecentTab
  STATE.peopleSearch = 'כ"ץ';
  const peopleHtml = renderPeopleTab().innerHTML;
  check('5c. renderPeopleTab properly escapes double quotes in peopleSearchInput value',
    !peopleHtml.includes('value="כ"ץ"'));
  STATE.peopleSearch = '';
}

// ---------------------------------------------------------------------------
// 6. DELETED CONGREGANT ("GHOST ID") CLEANUP & ARCHIVE DISPLAY
// ---------------------------------------------------------------------------
console.log('\\n--- 6. Deleted Congregant ("Ghost ID") Handling ---');
{
  resetCleanState();
  runAssignment('בראשית', '2026-10-10', {});
  const slot1Id = STATE.current.assign[1];
  const slot1Person = STATE.congregants.find(c => c.id === slot1Id);
  doConfirmAssignment();

  // Suppose congregant slot1Id is now locked in pendingLocks AND in a new draft, and then deleted
  runAssignment('נח', '2026-10-17', { 1: slot1Id });
  STATE.pendingLocks = { 2: slot1Id };

  // Delete slot1Id using a helper or simulating deletion
  if (typeof deleteCongregantById === 'function') {
    deleteCongregantById(slot1Id);
  } else {
    STATE.congregants = STATE.congregants.filter(c => c.id !== slot1Id);
    saveCongregants();
  }

  // Check 6a: archive read-only panel should NOT show "— לא שובץ —" when countFilled says 7/7!
  const archiveHtml = buildWeekPanelsReadOnly('בראשית', STATE.weeklyLog[0].assign, {});
  const showsUnassignedInArchive = archiveHtml.includes('— לא שובץ —');
  check('6a. Deleting a congregant does not turn their historical confirmed aliyah into "— לא שובץ —"',
    !showsUnassignedInArchive,
    showsUnassignedInArchive ? 'Historical week shows — לא שובץ — for a filled slot!' : '');

  // Check 6b: active draft & pendingLocks should not retain a deleted ghost ID
  const draftStillHasGhost = STATE.current && Object.values(STATE.current.assign).includes(slot1Id);
  const locksStillHasGhost = Object.values(STATE.pendingLocks).includes(slot1Id);
  check('6b. Deleting a congregant cleans up their ID from active draft (STATE.current) and pendingLocks',
    !draftStillHasGhost && !locksStillHasGhost,
    \`draftHasGhost=\${draftStillHasGhost}, locksHasGhost=\${locksStillHasGhost}\`);
}

// ---------------------------------------------------------------------------
// 7. STALE WARNINGS / UNFILLED REASONS ON MANUAL SELECT CHANGE
// ---------------------------------------------------------------------------
console.log('\\n--- 7. Manual Draft Assignment Updates Warnings & Reasons ---');
{
  resetCleanState();
  // Week 1: c1 reads in Bereshit
  STATE.weeklyLog.push({ id: 'w1', date: '2026-10-10', parasha: 'בראשית', assign: { 1: 'c1' }, deferred: [] });
  // Week 2: Noach (no one)
  STATE.weeklyLog.push({ id: 'w2', date: '2026-10-17', parasha: 'נח', assign: {}, deferred: [] });
  invalidateStatsCache();
  // Week 3: Lech Lecha -> c1 has gap=2 (recency warning)
  runAssignment('לך לך', '2026-10-24', {});
  // Force c1 into slot 1 with a recency warning, and then manually switch slot 1 to c4 (who never read)
  STATE.current.assign[1] = 'c1';
  STATE.current.recencyWarnings[1] = 'יצחק עוקב קרא לאחרונה לפני פחות מ-3 שבתות';
  STATE.current.unfilledReasons[1] = 'סיבה ישנה';

  if (typeof updateDraftSlotAssignment === 'function') {
    updateDraftSlotAssignment(1, 'c4');
  }
  check('7. Manually changing a draft slot clears stale unfilledReasons and recomputes recencyWarnings for the new person',
    !STATE.current.unfilledReasons[1] && !STATE.current.recencyWarnings[1],
    \`unfilledReasons[1]=\${STATE.current.unfilledReasons[1]}, recencyWarnings[1]=\${STATE.current.recencyWarnings[1]}\`);
}

// ---------------------------------------------------------------------------
// 8. SETTINGS PRESERVATION & VALIDATION (strongMin, lower > upper, Backup)
// ---------------------------------------------------------------------------
console.log('\\n--- 8. Settings Validation & Backup Roundtrip ---');
{
  resetCleanState();
  STATE.matchSettings = { lower: 70, upper: 125, strongMin: 35 };
  STATE.whatsappTemplate = 'תבנית בדיקה {שם}';

  // 8a. Backup roundtrip preserves matchSettings & whatsappTemplate
  let exportedObj = null;
  const origBlob = global.Blob;
  global.Blob = class TempBlob {
    constructor(parts) { exportedObj = JSON.parse(parts[0]); }
  };
  exportBackup();
  global.Blob = origBlob;

  STATE.matchSettings = { lower: 80, upper: 110, strongMin: 30 };
  STATE.whatsappTemplate = null;
  importBackup(exportedObj);

  check('8a. exportBackup / importBackup preserves matchSettings (including strongMin) and whatsappTemplate',
    STATE.matchSettings.lower === 70 && STATE.matchSettings.upper === 125 && STATE.matchSettings.strongMin === 35 && STATE.whatsappTemplate === 'תבנית בדיקה {שם}',
    JSON.stringify({ matchSettings: STATE.matchSettings, whatsappTemplate: STATE.whatsappTemplate }));

  // 8b. Inverted matchSettings (lower > upper) resilience in fits()
  STATE.matchSettings = { lower: 140, upper: 60, strongMin: 30 };
  const c4 = STATE.congregants.find(c => c.id === 'c4'); // level 20
  check('8b. fits() handles inverted matchSettings (lower > upper) gracefully without breaking matching',
    fits(c4, 20) === true);

  // 8c. Negative numbers in parseCongregantsCsv
  resetCleanState();
  const csvRes = parseCongregantsCsv('שם,טווח פסוקים,טלפון\\nמתפלל בדיקה,-15,050-1112222');
  check('8c. parseCongregantsCsv clamps negative/tiny pasuk level to >= 3',
    csvRes.toAdd.length === 1 && csvRes.toAdd[0].level >= 3,
    'Parsed level was: ' + (csvRes.toAdd[0] && csvRes.toAdd[0].level));
}

// ---------------------------------------------------------------------------
// 9. LEAP YEAR VS REGULAR YEAR AUTOMATIC SCHEDULE DETECTION
// ---------------------------------------------------------------------------
console.log('\\n--- 9. Hebrew Leap Year vs Regular Year Automatic Schedule ---');
{
  // 2024-03-15 is in 5784 (Leap Year - שנה מעוברת)
  const y5784 = getCurrentHebrewYearInfo('2024-03-15');
  check('9a. 5784 (2024) accurately detected as Hebrew Leap Year (שנה מעוברת)',
    y5784 && y5784.hYear === 5784 && y5784.isLeap === true);

  // 2026-03-15 is in 5786 (Regular Year - שנה פשוטה)
  const y5786 = getCurrentHebrewYearInfo('2026-03-15');
  check('9b. 5786 (2026) accurately detected as Regular Hebrew Year (שנה פשוטה)',
    y5786 && y5786.hYear === 5786 && y5786.isLeap === false);

  // 2027-03-15 is in 5787 (Leap Year - שנה מעוברת)
  const y5787 = getCurrentHebrewYearInfo('2027-03-15');
  check('9c. 5787 (2027) accurately detected as Hebrew Leap Year (שנה מעוברת)',
    y5787 && y5787.hYear === 5787 && y5787.isLeap === true);
}

// ---------------------------------------------------------------------------
// 10. ONE-CLICK REPLACEMENT CYCLING (suggestReplacementForAliyah)
// ---------------------------------------------------------------------------
console.log('\\n--- 10. One-Click Candidate Replacement Cycling ---');
{
  resetCleanState();
  runAssignment('בראשית', '2026-10-10', {});
  const initialId = STATE.current.assign[2]; // Aliyah 2 = 16 pesukim
  const seen = new Set([initialId]);
  let duplicateInWeek = false;
  for (let click = 0; click < 15; click++) {
    suggestReplacementForAliyah(2);
    const newId = STATE.current.assign[2];
    seen.add(newId);
    const allIds = Object.values(STATE.current.assign);
    if (new Set(allIds).size !== allIds.length) duplicateInWeek = true;
  }
  check('10. Clicking suggestReplacementForAliyah 15 times cycles through multiple candidates and never creates a duplicate in the week',
    seen.size >= 8 && !duplicateInWeek,
    \`seen=\${seen.size}, duplicateInWeek=\${duplicateInWeek}\`);
}

// ---------------------------------------------------------------------------
// 11. 1,080-WEEK (20-YEAR) STRESS SIMULATION + FULL UI TAB RENDERING
// ---------------------------------------------------------------------------
console.log('\\n--- 11. 1,080-Week (20-Year) Stress Simulation & Full Tab Rendering ---');
{
  resetCleanState();
  let ironRuleViolations = 0;
  let duplicateInWeekCount = 0;
  let missingUnfilledReasonCount = 0;
  let totalSlots = 0;
  let filledSlots = 0;
  let strongReads = 0;
  let normalReads = 0;

  // Temporarily stub render() during the 1,080-week loop for instant execution, then test real render() on all tabs
  const realRender = render;
  render = () => {};
  for (let w = 0; w < 1080; w++) {
    const pName = PARASHA_ORDER[w % 54];
    const prevAssignIds = w > 0 ? new Set(Object.values(STATE.weeklyLog[STATE.weeklyLog.length - 1].assign)) : new Set();
    const dateStr = new Date(Date.UTC(2026, 0, 3 + w * 7)).toISOString().slice(0, 10);
    runAssignment(pName, dateStr, {});
    const assignedIds = Object.values(STATE.current.assign);
    if (new Set(assignedIds).size !== assignedIds.length) duplicateInWeekCount++;
    for (let a = 1; a <= 7; a++) {
      totalSlots++;
      const cid = STATE.current.assign[a];
      if (cid) {
        filledSlots++;
        if (prevAssignIds.has(cid)) ironRuleViolations++;
        const p = resolvePerson(cid);
        if (p.unrestricted) strongReads++;
        else normalReads++;
      } else {
        if (!STATE.current.unfilledReasons || !STATE.current.unfilledReasons[a]) {
          missingUnfilledReasonCount++;
        }
      }
    }
    doConfirmAssignment();
  }
  render = realRender;

  check('11a. 0 Iron Rule violations across 1,080 weeks (7,560 aliyot)', ironRuleViolations === 0, 'Violations: ' + ironRuleViolations);
  check('11b. 0 duplicate readers in the same Shabbat across 1,080 weeks', duplicateInWeekCount === 0);
  check('11c. >90% aliyot filled automatically across 1,080 weeks AND 100% of unfilled slots have an explicit unfilledReason',
    filledSlots / totalSlots > 0.90 && missingUnfilledReasonCount === 0,
    \`filled=\${filledSlots}/\${totalSlots}, missingReasons=\${missingUnfilledReasonCount}\`);

  const avgStrong = strongReads / 5;
  const avgNormal = normalReads / 18;
  check('11d. Strong readers and normal readers maintain equal rotation pace over 20 years (diff < 3 reads)',
    Math.abs(avgStrong - avgNormal) < 3,
    \`avgStrong=\${avgStrong.toFixed(1)}, avgNormal=\${avgNormal.toFixed(1)}\`);

  // Render all 6 tabs with 1,080 weeks in weeklyLog + an active draft
  let renderCrashed = false;
  try {
    runAssignment('בראשית', '2047-01-01', {});
    for (const tabName of ['assign', 'recent', 'people', 'parashot', 'fairness', 'queue']) {
      STATE.tab = tabName;
      render();
    }
  } catch (e) {
    renderCrashed = true;
    console.error(e);
  }
  check('11e. All 6 UI tabs render cleanly without error after 1,080 logged weeks', !renderCrashed);
}

console.log('\\n======================================================');
console.log(\`SUMMARY: \${passed} passed, \${failed} failed\`);
console.log('======================================================\\n');
if (failed > 0) process.exit(1);
`;

fs.writeFileSync(runnerPath, jsCode + '\n' + testSuiteCode, 'utf8');
require(runnerPath);

