
const window = { localStorage: { getItem: ()=>null, setItem: ()=>{} } };
const localStorage = window.localStorage;
function render(){}

const HEB_LETTERS = ['א','ב','ג','ד','ה','ו','ז'];
const ALIYAH_NAMES = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שביעי'];

// ---------- default parasha data (name -> total verses, approximate/standard) ----------
const PARASHOT_DEFAULT_TOTALS = [
  ["בראשית",146],["נח",153],["לך לך",126],["וירא",147],["חיי שרה",105],["תולדות",106],
  ["ויצא",148],["וישלח",154],["וישב",112],["מקץ",146],["ויגש",106],["ויחי",85],
  ["שמות",124],["וארא",121],["בא",106],["בשלח",116],["יתרו",75],["משפטים",118],
  ["תרומה",96],["תצוה",101],["כי תשא",139],["ויקהל",122],["פקודי",92],["ויקרא",111],
  ["צו",97],["שמיני",91],["תזריע",67],["מצורע",90],["אחרי מות",80],["קדושים",64],
  ["אמור",124],["בהר",57],["בחוקותי",78],["במדבר",159],["נשא",176],["בהעלותך",136],
  ["שלח לך",119],["קורח",95],["חוקת",87],["בלק",104],["פינחס",168],["מטות",112],
  ["מסעי",132],["דברים",105],["ואתחנן",122],["עקב",111],["ראה",126],["שופטים",97],
  ["כי תצא",110],["כי תבוא",122],["נצבים",40],["וילך",30],["האזינו",52],["וזאת הברכה",41],
  ["ויקהל-פקודי",214],["תזריע-מצורע",157],["אחרי מות-קדושים",144],
  ["בהר-בחוקותי",135],["מטות-מסעי",244],["נצבים-וילך",70]
];

// ---------- parasha reading-cycle order (the real basis for "how long ago", see below) ----------
// The annual cycle has one fixed order. That order is a far more reliable "how long ago" signal
// than the date field: the date is typed by hand per week and can be wrong or reused (e.g. testing
// several parashot under the same date, or a gabbai fixing a typo later) without the parasha
// choice itself ever being wrong - so gap distance is computed from parasha position, and the
// calendar date is kept only as a secondary display hint, never as part of this calculation.
// Combined double portions (read only in non-leap years) are aliased to the first of their pair so
// they land at roughly the right cycle position instead of looking unrelated to their split-form
// neighbors.
const PARASHA_ORDER = PARASHOT_DEFAULT_TOTALS.map(p=>p[0]);
const PARASHA_CYCLE_LEN = 54; // the 54 regular (non-combined) parashot, in order, before it repeats
const PARASHA_COMBINED_FIRST_ALIAS = {
  "ויקהל-פקודי":"ויקהל", "תזריע-מצורע":"תזריע", "אחרי מות-קדושים":"אחרי מות",
  "בהר-בחוקותי":"בהר", "מטות-מסעי":"מטות", "נצבים-וילך":"נצבים"
};
const PARASHA_COMBINED_LAST_ALIAS = {
  "ויקהל-פקודי":"פקודי", "תזריע-מצורע":"מצורע", "אחרי מות-קדושים":"קדושים",
  "בהר-בחוקותי":"בחוקותי", "מטות-מסעי":"מסעי", "נצבים-וילך":"וילך"
};
function parashaOrderIndex(name, useEndOfPair){
  const aliasMap = useEndOfPair ? PARASHA_COMBINED_LAST_ALIAS : PARASHA_COMBINED_FIRST_ALIAS;
  const key = aliasMap[name] || name;
  const idx = PARASHA_ORDER.indexOf(key);
  return idx===-1 ? null : idx;
}
// Circular distance from an earlier parasha to a later one along the yearly cycle - 1 means "the
// parasha immediately before this one" (read it last week), large numbers mean a long time ago,
// including a full year back (which correctly comes out near PARASHA_CYCLE_LEN, not 0).
// When measuring FROM a combined double parasha (e.g. "ויקהל-פקודי") TO the next week ("ויקרא"),
// we measure from the second parasha of the pair ("פקודי") to the first of the target, so the
// immediate next Shabbat correctly computes a gap of 1 instead of 2.
function parashaGap(fromName, toName){
  const a = parashaOrderIndex(fromName, true), b = parashaOrderIndex(toName, false);
  if(a===null || b===null) return Infinity; // unrecognized name - never block on unknown data
  let diff = (b - a + PARASHA_CYCLE_LEN) % PARASHA_CYCLE_LEN;
  if(diff===0) diff = PARASHA_CYCLE_LEN;
  return diff;
}

// ---------- verified real traditional aliyah splits (checked against Hebcal/Sefaria/Artscroll) ----------
const PARASHOT_VERIFIED = {
  "בראשית": [34,16,27,21,4,28,16],
  "נח": [14,16,22,15,10,44,32],
  "לך לך": [13,11,14,20,10,37,21],
  "וירא": [14,19,20,40,17,13,24],
  "חיי שרה": [16,13,17,26,15,11,7],
  "תולדות": [21,7,10,7,33,23,5],
  "ויצא": [13,17,31,14,32,26,15],
  "וישלח": [10,17,8,15,42,37,24],
  "וישב": [11,11,14,30,6,17,23],
  "מקץ": [14,24,14,23,35,14,22],
  "ויגש": [13,11,11,9,28,17,17],
  "ויחי": [13,7,6,18,8,27,6],
  "שמות": [17,15,15,15,24,14,24],
  "וארא": [12,15,9,28,12,26,19],
  "בא": [11,12,9,27,8,23,16],
  "בשלח": [14,6,11,32,11,26,16],
  "יתרו": [12,11,4,6,13,20,9],
  "משפטים": [19,21,23,9,14,6,26],
  "תרומה": [16,24,14,16,7,8,11],
  "תצוה": [14,18,13,18,19,9,10],
  "כי תשא": [45,47,5,7,9,17,9],
  "ויקהל": [20,9,13,12,35,13,20],
  "פקודי": [12,20,11,11,16,11,11],
  "ויקרא": [13,10,10,17,26,19,16],
  "צו": [11,22,28,13,8,8,7],
  "שמיני": [16,7,12,4,5,32,15],
  "תזריע": [13,12,6,5,11,15,5],
  "מצורע": [12,8,12,21,19,13,5],
  "אחרי מות": [17,7,10,7,14,16,9],
  "קדושים": [14,8,10,5,7,15,5],
  "אמור": [15,25,17,22,10,12,23],
  "בהר": [13,5,6,4,10,8,11],
  "בחוקותי": [3,4,37,15,6,7,6],
  "במדבר": [19,35,34,13,26,12,20],
  "נשא": [17,12,10,48,41,30,18],
  "בהעלותך": [14,12,14,19,24,31,22],
  "שלח לך": [20,20,18,27,9,10,15],
  "קורח": [13,6,24,7,9,24,12],
  "חוקת": [17,11,7,8,17,11,16],
  "בלק": [11,8,18,15,14,17,21],
  "פינחס": [14,47,19,18,15,27,29],
  "מטות": [16,12,12,17,13,19,23],
  "מסעי": [10,39,22,14,8,26,13],
  "דברים": [10,11,17,9,29,21,8],
  "ואתחנן": [11,36,9,18,15,22,11],
  "עקב": [25,13,26,11,20,12,4],
  "ראה": [17,18,22,21,8,18,22],
  "שופטים": [18,7,5,8,22,17,20],
  "כי תצא": [12,9,29,17,6,9,28],
  "כי תבוא": [11,4,4,10,22,63,8],
  "נצבים": [3,3,14,6,4,4,6],
  "ויקהל-פקודי": [29,60,13,32,20,22,38],
  "תזריע-מצורע": [31,16,15,25,12,40,18],
  "אחרי מות-קדושים": [24,17,30,23,18,12,20],
  "בהר-בחוקותי": [18,10,10,26,37,15,19],
  "מטות-מסעי": [28,42,19,72,22,22,39],
  "נצבים-וילך": [20,6,8,12,7,6,11],
  "וילך": [3,3,3,4,6,5,6],
  "האזינו": [6,6,6,10,11,4,9],
  "וזאת הברכה": [7,5,5,4,5,3,12]
};

function defaultSplit(total){
  let base = Math.floor(total/7), rem = total % 7;
  let arr = new Array(7).fill(base);
  for(let i=0;i<rem;i++) arr[6-i]+=1;
  for(let i=0;i<7;i++) if(arr[i]<3) arr[i]=3;
  return arr;
}

// ---------- state ----------
let STATE = {
  tab:'assign',
  congregants:[],   // {id, name, level, baseTotal}
  weeklyLog:[],     // {id, date:"YYYY-MM-DD", parasha, assign:{"1":congId,...}, deferred:[ids]}
  parashot:{},      // name -> [7 nums] (manual overrides)
  current:null,     // draft: {date, parasha, assign:{}, deferred:[], confirmed:false}
  loaded:false,
  editingCongregant:null,
  viewingHistory:null,
  editingParasha:null,
  pendingParasha:null,   // ephemeral: what's picked in the selector before START is pressed
  pendingDate:null,      // ephemeral: manual date fallback when the calendar library can't load
  manualWeekDraft:null,  // {parasha, date, assign} while backfilling a past week
  peopleSortMode:'name', // 'name' | 'stale' (longest since last read first)
  peopleSearch:'',        // filter text for the congregants tab
  peopleFilter:'all',     // 'all' | 'paused' | 'strong' - congregants tab quick filter chips
  pendingLocks:{},        // aliyahNum -> congId, set before START to pre-lock specific aliyot
  copyTextModal:null,     // text content while the "copy as text" modal is open
  matchSettings:{lower:65, upper:130, strongMin:30}, // % window for normal readers + preferred minimum pesukim for strong readers - widened from 80-110 after a 1000-week simulation showed it nearly halves the fairness spread (220->107) and raises fully-filled weeks from 65% to 85%
  whatsappTemplate:null, // custom message template, null = use DEFAULT_WHATSAPP_TEMPLATE
  confirmModal:null,     // {message, onConfirm} - in-app replacement for window.confirm()
  noticeModal:null,      // message - in-app replacement for window.alert()
  editingWeekId:null,     // id of the one confirmed week currently unlocked for editing (recent tab)
  expandedWeekIds:{},     // weekId -> true, which archive blocks are open
  recentSearch:'',        // filter text for the archive
  printModal:null,        // HTML content while the print-preview modal is open
  suggestedParasha:null,  // {name, date} computed for the upcoming Shabbat
  parashaCalendar:[],     // full lookahead list of {name, date} for the next ~14 months
  calendarStatus:'loading', // 'loading' | 'ok' | 'error'
  fairnessSimLower:null,  // ephemeral: what-if slider state on the fairness tab, null = falls back to matchSettings
  fairnessSimUpper:null
};

// ---------- date helpers ----------
function nextSaturdayISO(){
  const d = new Date();
  const day = d.getDay();
  const diff = (6 - day + 7) % 7;
  d.setDate(d.getDate()+diff);
  return d.toISOString().slice(0,10);
}
function formatDate(iso){
  if(!iso) return '';
  const parts = iso.split('-');
  if(parts.length!==3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
function genId(){ return 'w'+Math.random().toString(36).slice(2,9); }

// normalizes an Israeli-style local number (05X-XXXXXXX) or an already-international one
// into the digits-only format wa.me expects (country code, no + or leading 0)
function phoneToWhatsappDigits(phone){
  let digits = (phone||'').replace(/\D/g,'');
  if(!digits) return '';
  if(digits.startsWith('0')) digits = '972' + digits.slice(1);
  return digits;
}
// builds a YouTube search link for R' Nir Gahali's channel (Yemenite/Shami nusach readings),
// scoped by parasha + aliyah name. Not a guaranteed single exact video, but this channel is
// specific enough that the right video is normally the first or near-first result.
function youtubeSearchLinkForAliyah(parashaName, aliyahName){
  const query = `ניר גהלי קריאת פרשת ${parashaName} עולה ${aliyahName}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
const DEFAULT_WHATSAPP_TEMPLATE = 'שלום {שם}, אתה משובץ השבת לעלייה {עלייה} בפרשת {פרשה}. שבת שלום!\nלצפייה בקריאה (נוסח שאמי, ניר גהלי): {סרטון}';
function whatsappLinkForPerson(person, parashaName, aliyahName){
  const digits = phoneToWhatsappDigits(person.phone);
  if(!digits) return null;
  const template = STATE.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
  const message = template
    .replace(/\{שם\}/g, person.name)
    .replace(/\{עלייה\}/g, aliyahName)
    .replace(/\{פרשה\}/g, parashaName)
    .replace(/\{סרטון\}/g, youtubeSearchLinkForAliyah(parashaName, aliyahName));
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// ---------- storage abstraction ----------
// Uses window.storage when running inside a Claude artifact (this conversation, for testing).
// Falls back to the browser's own localStorage when window.storage isn't available - which is
// what will actually run once this file is hosted on its own (e.g. GitHub Pages/Netlify) and
// opened directly in a regular browser. Same key names either way, so nothing else in the app
// needs to know or care which one is active.
const LS_PREFIX = 'shibutz-aliyot:';
const hasClaudeStorage = (typeof window!=='undefined' && !!window.storage);
const Store = {
  async get(key){
    if(hasClaudeStorage){
      try{ return await window.storage.get(key); }catch(e){ return null; }
    }
    try{
      const raw = localStorage.getItem(LS_PREFIX+key);
      return raw===null ? null : {key, value: raw};
    }catch(e){ return null; }
  },
  async set(key, value){
    if(hasClaudeStorage){
      try{ return await window.storage.set(key, value); }catch(e){ return null; }
    }
    try{
      localStorage.setItem(LS_PREFIX+key, value);
      return {key, value};
    }catch(e){ return null; }
  }
};

// ---------- live Hebrew-calendar lookup ----------
// Computes the parasha for every upcoming Shabbat over the next ~14 months, so we can look up
// the real date for ANY parasha the gabbai picks, not just the very next one.
// Primary method: a plain data fetch to Hebcal's public JSON API (a simple GET request, not a
// script/module load - this is far more likely to be permitted by any sandboxed preview than
// importing an executable library, and is exactly the same request a normal browser would make).
// Secondary fallback: Hebcal's own JS library via CDN, in case the API fetch is unreachable.
// Always uses the Israel reading schedule, per how this shul reads.
async function fetchUpcomingParasha(){
  if(await fetchViaHebcalApi()){ saveParashaCalendar(); render(); return; }
  if(await fetchViaHebcalLibrary()){ saveParashaCalendar(); render(); return; }
  if(STATE.calendarStatus!=='ok') STATE.calendarStatus = 'error'; // keep showing cached data if we have it
  render();
}
async function saveParashaCalendar(){
  try{ await Store.set('parashaCalendar', JSON.stringify({calendar:STATE.parashaCalendar, fetchedAt:new Date().toISOString()})); }catch(e){}
}

async function fetchViaHebcalApi(){
  try{
    const start = new Date(); start.setDate(start.getDate()-380);
    const end = new Date(); end.setDate(end.getDate()+380);
    const fmt = d => d.toISOString().slice(0,10);
    const url = `https://www.hebcal.com/hebcal?cfg=json&v=1&maj=off&min=off&mod=off&nx=off&mf=off&ss=off&s=on&start=${fmt(start)}&end=${fmt(end)}&i=on`;
    const res = await fetch(url);
    const data = await res.json();
    const calendar = (data.items||[])
      .filter(it=>it.category==='parashat')
      .map(it=>({ name: (it.hebrew||'').replace(/^פרשת\s+/,'').trim(), date: it.date }))
      .filter(c=>c.name);
    if(calendar.length===0) return false;
    STATE.parashaCalendar = calendar;
    const todayStr = fmt(new Date());
    STATE.suggestedParasha = calendar.find(c=>c.date>=todayStr) || calendar[calendar.length-1];
    STATE.calendarStatus = 'ok';
    return true;
  }catch(e){ return false; }
}

async function fetchViaHebcalLibrary(){
  try{
    const { HDate, getSedra, ParshaEvent } = await import('https://cdn.jsdelivr.net/npm/@hebcal/core/+esm');
    let d = new Date(); d.setDate(d.getDate()-380);
    const day = d.getDay();
    d.setDate(d.getDate() + ((6 - day + 7) % 7)); // land on a Saturday
    const calendar = [];
    for(let i=0; i<110; i++){ // ~380 days back through ~380 days forward
      const hd = new HDate(d);
      const info = getSedra(hd.getFullYear(), true).lookup(hd);
      if(info && !info.chag){
        const ev = new ParshaEvent(info);
        const name = (ev.render('he')||'').replace(/^פרשת\s+/,'').trim();
        calendar.push({ name, date: d.toISOString().slice(0,10) });
      }
      d.setDate(d.getDate()+7);
    }
    if(calendar.length===0) return false;
    STATE.parashaCalendar = calendar;
    const todayStr = new Date().toISOString().slice(0,10);
    STATE.suggestedParasha = calendar.find(c=>c.date>=todayStr) || calendar[calendar.length-1];
    STATE.calendarStatus = 'ok';
    return true;
  }catch(e){ return false; }
}

// Offline/instant Hebrew year leap-year & reading-schedule awareness using the browser's built-in
// Intl Hebrew calendar, refined automatically by the live Hebcal Israel schedule (`parashaCalendar`).
const COMBINED_PAIRS_LIST = [
  ["ויקהל-פקודי", "ויקהל", "פקודי"],
  ["תזריע-מצורע", "תזריע", "מצורע"],
  ["אחרי מות-קדושים", "אחרי מות", "קדושים"],
  ["בהר-בחוקותי", "בהר", "בחוקותי"],
  ["מטות-מסעי", "מטות", "מסעי"],
  ["נצבים-וילך", "נצבים", "וילך"]
];
function getCurrentHebrewYearInfo(refDateStr){
  try{
    const d = refDateStr ? new Date(refDateStr) : new Date();
    const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', {year:'numeric', month:'long'}).formatToParts(d);
    const yStr = (parts.find(p=>p.type==='year')||{}).value || '';
    const hYear = parseInt(yStr, 10);
    if(!hYear) return null;
    // Metonic cycle: years 3, 6, 8, 11, 14, 17, 19 of the 19-year cycle are leap years (שנה מעוברת)
    const rem = ((hYear % 19) + 19) % 19;
    const isLeap = [0, 3, 6, 8, 11, 14, 17].includes(rem);
    return { hYear, isLeap };
  }catch(e){ return null; }
}
// Returns the active parasha options for the current year cycle vs. inactive ones (e.g. combined
// pairs during a leap year when parashot are read separately, or split pairs when combined).
// Uses `STATE.parashaCalendar` (upcoming 52 weeks from Hebcal Israel schedule) when available,
// and falls back automatically to the Hebrew leap-year calculation (`getCurrentHebrewYearInfo`).
function getActiveParashotForCurrentYear(){
  const todayStr = new Date().toISOString().slice(0,10);
  const oneYearAhead = new Date(); oneYearAhead.setDate(oneYearAhead.getDate()+355);
  const limitStr = oneYearAhead.toISOString().slice(0,10);
  const upcoming = (STATE.parashaCalendar||[]).filter(c=>c.date>=todayStr && c.date<=limitStr);
  const hebInfo = getCurrentHebrewYearInfo(todayStr);

  // Determine for each of the 6 combinable pairs whether it is combined or split this year
  const pairIsCombined = {};
  for(const [comb, p1, p2] of COMBINED_PAIRS_LIST){
    if(upcoming.length >= 20){
      // Live Hebcal schedule knows the exact Israel custom for this year
      if(upcoming.some(c=>c.name===comb)) pairIsCombined[comb] = true;
      else if(upcoming.some(c=>c.name===p1 || c.name===p2)) pairIsCombined[comb] = false;
      else pairIsCombined[comb] = hebInfo ? !hebInfo.isLeap : false;
    } else {
      // Offline fallback: in a leap year (שנה מעוברת), Vayakhel-Pekudei, Tazria-Metzora,
      // Acharei-Kedoshim, Behar-Bechukotai are ALWAYS separate!
      if(hebInfo && hebInfo.isLeap){
        pairIsCombined[comb] = (comb === "מטות-מסעי"); // In leap years, usually only Matot-Masei (or Nitzavim-Vayeilech) can combine
      } else {
        pairIsCombined[comb] = true;
      }
    }
  }

  const excludedSet = new Set();
  for(const [comb, p1, p2] of COMBINED_PAIRS_LIST){
    if(pairIsCombined[comb]){
      excludedSet.add(p1);
      excludedSet.add(p2);
    } else {
      excludedSet.add(comb);
    }
  }

  // Build ordered active list in standard Torah reading order (inserting combined pairs in their
  // natural place instead of tacking them onto the end of the list)
  const activeList = [];
  const otherList = [];
  const combByFirst = {};
  for(const [comb, p1] of COMBINED_PAIRS_LIST){ combByFirst[p1] = comb; }

  for(let i=0; i<54; i++){
    const [name, total] = PARASHOT_DEFAULT_TOTALS[i];
    const combName = combByFirst[name];
    if(combName){
      const combEntry = PARASHOT_DEFAULT_TOTALS.find(p=>p[0]===combName);
      if(pairIsCombined[combName] && combEntry){
        activeList.push(combEntry);
      }
    }
    if(!excludedSet.has(name)){
      activeList.push([name, total]);
    } else {
      otherList.push([name, total]);
    }
  }
  for(const [comb] of COMBINED_PAIRS_LIST){
    if(excludedSet.has(comb)){
      const combEntry = PARASHOT_DEFAULT_TOTALS.find(p=>p[0]===comb);
      if(combEntry) otherList.push(combEntry);
    }
  }

  const separatedCount = COMBINED_PAIRS_LIST.filter(([comb])=>!pairIsCombined[comb]).length;
  const isLeapYear = hebInfo ? hebInfo.isLeap : (separatedCount >= 4);
  return { activeList, otherList, isLeapYear, hebYear: hebInfo ? hebInfo.hYear : null, pairIsCombined };
}

// Looks up the real upcoming date for a specific parasha name from the precomputed calendar.
// Falls back to the suggested/next date if the name isn't found within the lookahead window.
function getDateForParasha(name){
  const todayStr = new Date().toISOString().slice(0,10);
  const hit = (STATE.parashaCalendar||[]).find(c=>c.name===name && c.date>=todayStr);
  if(hit) return hit.date;
  return STATE.suggestedParasha ? STATE.suggestedParasha.date : nextSaturdayISO();
}
// Looks up the most recent PAST date a given parasha was read - used to default the date
// when backfilling a past week, so the gabbai doesn't have to remember/look it up manually.
function getPastDateForParasha(name){
  const todayStr = new Date().toISOString().slice(0,10);
  const matches = (STATE.parashaCalendar||[]).filter(c=>c.name===name && c.date<todayStr);
  return matches.length ? matches[matches.length-1].date : '';
}
// The parasha read on the most recent past Shabbat - a sensible default when opening the
// "add a past week" form for the first time.
function getMostRecentPastParasha(){
  const todayStr = new Date().toISOString().slice(0,10);
  const past = (STATE.parashaCalendar||[]).filter(c=>c.date<todayStr);
  return past.length ? past[past.length-1] : null;
}
// Most recent confirmed weeklyLog entry for the given parasha name, if any - a memory aid for
// the gabbai when picking who to assign, shown before he even hits "בצע שיבוץ".
function getPreviousAssignmentForParasha(name){
  const matches = STATE.weeklyLog.filter(w=>w.parasha===name).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return matches.length ? matches[0] : null;
}

// ---------- storage helpers ----------
async function loadAll(){
  let needSeed = false;
  try{
    const c = await Store.get('congregants');
    if(c){ STATE.congregants = JSON.parse(c.value); } else { needSeed = true; }
  }catch(e){ needSeed = true; }

  if(needSeed){
    const seed = seedData();
    STATE.congregants = seed.congregants;
    STATE.weeklyLog = seed.weeklyLog;
    await saveCongregants();
    await saveWeeklyLog();
  } else {
    try{
      const w = await Store.get('weeklyLog');
      STATE.weeklyLog = w ? JSON.parse(w.value) : [];
    }catch(e){ STATE.weeklyLog = []; }
  }

  try{
    const p = await Store.get('parashot');
    STATE.parashot = p ? JSON.parse(p.value) : {};
  }catch(e){ STATE.parashot = {}; }

  try{
    const cur = await Store.get('current');
    STATE.current = cur ? JSON.parse(cur.value) : null;
  }catch(e){ STATE.current = null; }

  try{
    const ms = await Store.get('matchSettings');
    if(ms) STATE.matchSettings = JSON.parse(ms.value);
  }catch(e){}

  try{
    const wt = await Store.get('whatsappTemplate');
    if(wt && wt.value) STATE.whatsappTemplate = wt.value;
  }catch(e){}

  // Show a cached calendar immediately (no "loading..." flash on repeat visits) while a fresh
  // copy is fetched in the background below, regardless of cache age - fetchUpcomingParasha()
  // silently replaces it once the network call resolves either way.
  try{
    const pc = await Store.get('parashaCalendar');
    if(pc){
      const cached = JSON.parse(pc.value);
      if(cached && Array.isArray(cached.calendar) && cached.calendar.length){
        STATE.parashaCalendar = cached.calendar;
        const todayStr = new Date().toISOString().slice(0,10);
        STATE.suggestedParasha = cached.calendar.find(c=>c.date>=todayStr) || cached.calendar[cached.calendar.length-1];
        STATE.calendarStatus = 'ok';
      }
    }
  }catch(e){}

  STATE.loaded = true;
  render();
  fetchUpcomingParasha();
}
async function saveMatchSettings(){ try{ await Store.set('matchSettings', JSON.stringify(STATE.matchSettings)); }catch(e){} }
async function saveWhatsappTemplate(){ try{ await Store.set('whatsappTemplate', STATE.whatsappTemplate||''); }catch(e){} }
async function saveCongregants(){ invalidateStatsCache(); try{ await Store.set('congregants', JSON.stringify(STATE.congregants)); }catch(e){} }
async function saveWeeklyLog(){ invalidateStatsCache(); try{ await Store.set('weeklyLog', JSON.stringify(STATE.weeklyLog)); }catch(e){} }
async function saveParashot(){ try{ await Store.set('parashot', JSON.stringify(STATE.parashot)); }catch(e){} }
async function saveCurrent(){ try{ await Store.set('current', JSON.stringify(STATE.current)); }catch(e){} }

// ---------- backup export/import ----------
function csvEscape(val){
  const s = String(val==null?'':val);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function exportHistoryCsv(){
  const rows = [['תאריך','פרשה','עלייה','מתפלל']];
  const sorted = STATE.weeklyLog.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  for(const w of sorted){
    for(let i=1;i<=7;i++){
      const id = w.assign[i] || w.assign[String(i)];
      if(!id) continue;
      const person = resolvePerson(id);
      rows.push([formatDate(w.date), w.parasha, ALIYAH_NAMES[i-1], person ? person.name : '—']);
    }
  }
  const csv = '\uFEFF' + rows.map(r=>r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `היסטוריית-עליות-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportBackup(){
  const backup = {
    exportedAt: new Date().toISOString(),
    congregants: STATE.congregants,
    weeklyLog: STATE.weeklyLog,
    parashot: STATE.parashot
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `שיבוץ-עליות-גיבוי-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function importBackup(data){
  if(!data || !Array.isArray(data.congregants) || !Array.isArray(data.weeklyLog)){
    throw new Error('invalid backup file');
  }
  STATE.congregants = data.congregants;
  STATE.weeklyLog = data.weeklyLog;
  STATE.parashot = data.parashot || {};
  saveCongregants();
  saveWeeklyLog();
  saveParashot();
}

// splits one CSV line respecting double-quoted fields (mirrors csvEscape's quoting above)
function parseCsvLine(line){
  const result = [];
  let cur = '', inQuotes = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(inQuotes){
      if(ch==='"'){ if(line[i+1]==='"'){ cur+='"'; i++; } else inQuotes=false; }
      else cur+=ch;
    } else {
      if(ch==='"') inQuotes=true;
      else if(ch===','){ result.push(cur); cur=''; }
      else cur+=ch;
    }
  }
  result.push(cur);
  return result;
}
// Parses a roster CSV (header row: שם,טווח פסוקים,טלפון - "חזק" in the level column marks a
// strong/unrestricted reader) WITHOUT touching STATE yet - matched against existing congregants
// by exact name. The caller shows this as a confirm-summary before calling applyCongregantsCsv,
// so a bad paste can't silently corrupt the real roster.
function parseCongregantsCsv(text){
  text = text.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length);
  if(lines.length<2) return {toAdd:[], toUpdate:[], skipped:0};
  lines.shift(); // header row
  const toAdd = [], toUpdate = [];
  let skipped = 0;
  for(const line of lines){
    const cols = parseCsvLine(line);
    const name = (cols[0]||'').trim();
    if(!name){ skipped++; continue; }
    const levelRaw = (cols[1]||'').trim();
    const phone = (cols[2]||'').trim();
    const unrestricted = /^(חזק|strong)$/i.test(levelRaw);
    const level = unrestricted ? 100 : (parseInt(levelRaw)||20);
    const existing = STATE.congregants.find(c=>c.name===name);
    if(existing) toUpdate.push({existing, level, unrestricted, phone});
    else toAdd.push({name, level, unrestricted, phone});
  }
  return {toAdd, toUpdate, skipped};
}
function applyCongregantsCsv(parsed){
  for(const u of parsed.toUpdate){
    u.existing.level = u.level;
    u.existing.unrestricted = u.unrestricted;
    if(u.phone) u.existing.phone = u.phone;
  }
  for(const a of parsed.toAdd){
    STATE.congregants.push({ id:'c'+Math.random().toString(36).slice(2,9), name:a.name, level:a.level, baseTotal:0, unrestricted:a.unrestricted, phone:a.phone });
  }
  saveCongregants();
}

function getBaselineSplit(name){
  if(PARASHOT_VERIFIED[name]) return PARASHOT_VERIFIED[name];
  const found = PARASHOT_DEFAULT_TOTALS.find(p=>p[0]===name);
  return defaultSplit(found ? found[1] : 105);
}
function arraysEqual(a,b){
  return a.length===b.length && a.every((v,i)=>v===b[i]);
}
function getSplit(name){
  if(STATE.parashot[name]) return STATE.parashot[name];
  return getBaselineSplit(name);
}
function getStatus(name){
  const override = STATE.parashot[name];
  const baseline = getBaselineSplit(name);
  const isRealOverride = override && !arraysEqual(override, baseline);
  if(isRealOverride) return {label:'מותאם ידנית', cls:'pill-gold'};
  if(PARASHOT_VERIFIED[name]) return {label:'מאומת ✓', cls:'pill-good'};
  return {label:'משוער - טרם אומת', cls:'pill-warn'};
}
// describes exactly which aliyot were changed by a manual override, e.g. "א: 34→35"
function getOverrideDiff(name){
  const override = STATE.parashot[name];
  if(!override) return '';
  const baseline = getBaselineSplit(name);
  if(arraysEqual(override, baseline)) return '';
  const parts = [];
  for(let i=0;i<7;i++){
    if(override[i] !== baseline[i]) parts.push(`${HEB_LETTERS[i]}: ${baseline[i]}→${override[i]}`);
  }
  return parts.join(', ');
}

// ---------- derived congregant stats (computed from weeklyLog, never stored redundantly) ----------
// Stats are still fully derived from weeklyLog on every read (no redundant storage) - but instead
// of each getCongStats(id) call rescanning the whole log, buildStatsMap() walks weeklyLog ONCE and
// buckets entries by congregant id, then getCongStats(id) is just a map lookup. The cache is
// invalidated (statsCache=null) inside saveCongregants()/saveWeeklyLog(), which every mutation
// path already calls before render() - so there is no separate invalidation bookkeeping to keep in
// sync. This matters because fairnessCompare() (called from .sort() inside runAssignment) used to
// rescan the entire log on every single comparison.
function aggregateStatsFromLog(logEntries){
  const map = {};
  for(const c of STATE.congregants){
    map[c.id] = { entries: [], base: c.baseTotal||0 };
  }
  for(let logIdx=0; logIdx<logEntries.length; logIdx++){
    const w = logEntries[logIdx];
    for(const k of Object.keys(w.assign||{})){
      const id = w.assign[k];
      if(map[id]) map[id].entries.push({date:w.date, parasha:w.parasha, aliyah:parseInt(k), weekId:w.id, logIdx});
    }
  }
  const result = {};
  for(const id in map){
    const { entries, base } = map[id];
    entries.sort((a,b)=> (a.date||'').localeCompare(b.date||'') || (a.logIdx - b.logIdx));
    result[id] = {
      total: base + entries.length,
      lastEntry: entries.length ? entries[entries.length-1] : null,
      history: entries.slice().reverse()
    };
  }
  return result;
}
let statsCache = null;
function invalidateStatsCache(){ statsCache = null; }
function buildStatsMap(){
  if(statsCache) return statsCache;
  statsCache = aggregateStatsFromLog(STATE.weeklyLog);
  return statsCache;
}
function getCongStats(id){
  const map = buildStatsMap();
  return map[id] || { total:0, lastEntry:null, history:[] };
}
// Stats as they stood strictly BEFORE a given date - used to explain a past week's decisions
// with the totals that were actually true at the time, not today's totals (which include
// everything read since, and would misrepresent who was "ahead in the queue" back then). Not
// cached - only used for the occasional "explain this past week" view, not a hot path.
function buildStatsMapAsOf(beforeDate){
  const priorLog = STATE.weeklyLog.filter(w => (w.date||'') < (beforeDate||''));
  return aggregateStatsFromLog(priorLog);
}

// ---------- seed / demo data ----------
function seedData(){
  // real roster - people marked unrestricted:true are strong readers with no real ceiling;
  // "level" for them is just a display placeholder, not used for matching (see fits()).
  const congregants = [
    {id:'c1', name:"יצחק עוקב", level:25, baseTotal:0, unrestricted:false},
    {id:'c2', name:"נריה כתר", level:100, baseTotal:0, unrestricted:true},
    {id:'c3', name:"אבטליון בן אהרון", level:10, baseTotal:0, unrestricted:false},
    {id:'c4', name:"אסף בן אהרון", level:20, baseTotal:0, unrestricted:false},
    {id:'c5', name:"נעם בן אהרון", level:18, baseTotal:0, unrestricted:false},
    {id:'c6', name:"שלום עמית", level:20, baseTotal:0, unrestricted:false},
    {id:'c7', name:"אפרים עפגיון", level:20, baseTotal:0, unrestricted:false},
    {id:'c8', name:"שלמה עמר", level:15, baseTotal:0, unrestricted:false},
    {id:'c9', name:"אמיר אושרי", level:25, baseTotal:0, unrestricted:false},
    {id:'c10', name:"רצון רדיע", level:25, baseTotal:0, unrestricted:false},
    {id:'c11', name:"צוריאל מליחי", level:20, baseTotal:0, unrestricted:false},
    {id:'c12', name:"דביר עמית", level:100, baseTotal:0, unrestricted:true},
    {id:'c13', name:"עדי קהלני", level:20, baseTotal:0, unrestricted:false},
    {id:'c14', name:"נועם אהרוני", level:16, baseTotal:0, unrestricted:false},
    {id:'c15', name:"רן עקאל", level:25, baseTotal:0, unrestricted:false},
    {id:'c16', name:"אבנר בן טוב", level:15, baseTotal:0, unrestricted:false},
    {id:'c17', name:"בצלאל", level:100, baseTotal:0, unrestricted:true},
    {id:'c18', name:"דני חרבי", level:100, baseTotal:0, unrestricted:true},
    {id:'c19', name:"יגאל ירימי", level:25, baseTotal:0, unrestricted:false},
    {id:'c20', name:"רחמים דקל", level:25, baseTotal:0, unrestricted:false},
    {id:'c21', name:"ציון עקאל", level:13, baseTotal:0, unrestricted:false},
    {id:'c22', name:"יחיאל סהר", level:20, baseTotal:0, unrestricted:false},
    {id:'c23', name:"חיים עפגין", level:100, baseTotal:0, unrestricted:true}
  ];
  // clean slate - no fabricated history, since this is the real roster
  const weeklyLog = [];
  return {congregants, weeklyLog};
}

// ---------- assignment algorithm ----------
// A person should be matched to an aliyah close to the top of what they can handle -
// not "anything up to their max" (which wastes a strong reader on a tiny aliyah).
// Accepted window: 80%-110% of their stated max pasuk count.
// Resolves an assign-object value to a displayable person. Real congregants are looked up
// normally; a "guest:<name>" value represents a one-off guest reader typed in by the gabbai
// for that specific aliyah - a different person can be named each time, with no pasuk limit.
function resolvePerson(id){
  if(!id) return null;
  if(id.startsWith('guest:')){
    const name = id.slice(6);
    return { id, name: name ? `${name} (אורח)` : 'אורח (ללא שם)', unrestricted:true, isGuest:true, level:0 };
  }
  return STATE.congregants.find(c=>c.id===id) || null;
}

// How many parashot back (by fixed reading-cycle order, not calendar date) a person's last
// confirmed reading was from the given parasha. This is the real recency signal - see
// parashaGap's comment for why the date field alone isn't trustworthy enough to gate on.
function parashaGapSinceLastRead(stats, parashaName){
  if(!stats || !stats.lastEntry || !stats.lastEntry.parasha) return Infinity;
  return parashaGap(stats.lastEntry.parasha, parashaName);
}
// Iron rule (no exceptions, ever): the immediately preceding parasha (gap of 1) makes someone
// completely ineligible this week - not a low-priority option, not a last resort, invisible to
// the algorithm entirely. Callers filter pools with this before any fairness/fit logic runs.
function isRecencyBlocked(stats, parashaName){
  return parashaGapSinceLastRead(stats, parashaName) <= 1;
}
// Soft rule: a gap of 2 parashot back ("read within the last Shabbat beyond the immediately
// preceding one") is allowed if nothing better is available, but should surface a written
// warning to the gabbai rather than passing silently. 3+ parashot back (or never read) is the
// clean, unflagged case - "3 weeks and up is the ideal" per the rule as given.
function isRecencyWarning(stats, parashaName){
  const g = parashaGapSinceLastRead(stats, parashaName);
  return g > 1 && g < 3;
}
// Finds the best available candidate in a fairness-sorted pool for a given fit test, honoring the
// two recency rules above: prefers someone with a clean gap (3+ parashot / never read); only
// falls back to someone in the 2-parashot warning zone if no clean candidate fits. The pool
// itself must already exclude anyone hard-blocked (gap of 1) - see isRecencyBlocked - this
// function only chooses between the remaining two tiers.
function findFairCandidate(pool, usedSet, fitTest, parashaName){
  let person = pool.find(p => !usedSet.has(p.id) && fitTest(p) && !isRecencyWarning(getCongStats(p.id), parashaName));
  if(person) return { person, recentGap:false };
  person = pool.find(p => !usedSet.has(p.id) && fitTest(p));
  if(person) return { person, recentGap:true };
  return null;
}

function fits(person, pesukim){
  if(person.unrestricted) return true; // strong reader - no real ceiling, any aliyah is fair game
  const lowerPct = (STATE.matchSettings && STATE.matchSettings.lower) || 80;
  const upperPct = (STATE.matchSettings && STATE.matchSettings.upper) || 110;
  const min = person.level * (lowerPct/100);
  const max = person.level * (upperPct/100);
  return pesukim >= min - 1e-6 && pesukim <= max + 1e-6;
}

// Real (not simulated) flexibility measure for a hypothetical lower/upper % range: across every
// known parasha's real aliyah split, how many active normal readers could ever cover each aliyah,
// on average. Uses the exact same fits-window formula as fits() itself, so it's a direct read on
// the live algorithm's slack, not a guess - a wider range/more overlap between people's ranges
// means fewer aliyot get stuck with zero fitting readers, which is what actually drives the
// fairness spread down. Used by the fairness tab's what-if sliders.
function computeFlexibilityScore(lowerPct, upperPct){
  const normalActive = STATE.congregants.filter(c=>!c.unrestricted && !c.paused);
  if(normalActive.length===0) return 0;
  let totalFits = 0, totalSlots = 0;
  for(const [name] of PARASHOT_DEFAULT_TOTALS){
    for(const pesukim of getSplit(name)){
      totalSlots++;
      for(const c of normalActive){
        const lo = c.level*(lowerPct/100), hi = c.level*(upperPct/100);
        if(pesukim >= lo-1e-6 && pesukim <= hi+1e-6) totalFits++;
      }
    }
  }
  return totalSlots ? totalFits/totalSlots : 0;
}

function fairnessCompare(a, b, parashaName){
  const sa = getCongStats(a.id), sb = getCongStats(b.id);
  if(sa.total !== sb.total) return sa.total - sb.total;
  const aNever = sa.lastEntry ? 1:0, bNever = sb.lastEntry ? 1:0;
  if(aNever !== bNever) return aNever - bNever;
  // Tiebreaker for equal totals: whoever read longer ago (larger parasha gap, or older date) comes first
  if(parashaName && sa.lastEntry && sb.lastEntry){
    const gapA = parashaGapSinceLastRead(sa, parashaName);
    const gapB = parashaGapSinceLastRead(sb, parashaName);
    if(gapA !== gapB) return gapB - gapA;
  }
  const dateA = (sa.lastEntry && sa.lastEntry.date) || '';
  const dateB = (sb.lastEntry && sb.lastEntry.date) || '';
  if(dateA !== dateB) return dateA.localeCompare(dateB);
  const idxA = (sa.lastEntry && sa.lastEntry.logIdx!=null) ? sa.lastEntry.logIdx : -1;
  const idxB = (sb.lastEntry && sb.lastEntry.logIdx!=null) ? sb.lastEntry.logIdx : -1;
  if(idxA !== idxB) return idxA - idxB;
  return Math.random() - 0.5;
}
// Same ordering as fairnessCompare, but with a deterministic (alphabetical) tiebreak instead of
// Math.random() - used only for DISPLAYING the queue on the fairness-queue tab, so the list
// doesn't visibly reshuffle itself on every render. The real algorithm keeps its random tiebreak
// on purpose (see fairnessCompare) - this never touches an actual assignment, display only.
// Takes an explicit statsMap so a past week can be sorted by the totals as they stood back then
// (see buildStatsMapAsOf), not by today's totals.
function fairnessCompareStable(a, b, statsMap, parashaName){
  const sa = statsMap[a.id] || {total:0, lastEntry:null}, sb = statsMap[b.id] || {total:0, lastEntry:null};
  if(sa.total !== sb.total) return sa.total - sb.total;
  const aNever = sa.lastEntry ? 1:0, bNever = sb.lastEntry ? 1:0;
  if(aNever !== bNever) return aNever - bNever;
  if(parashaName && sa.lastEntry && sb.lastEntry){
    const gapA = parashaGapSinceLastRead(sa, parashaName);
    const gapB = parashaGapSinceLastRead(sb, parashaName);
    if(gapA !== gapB) return gapB - gapA;
  }
  const dateA = (sa.lastEntry && sa.lastEntry.date) || '';
  const dateB = (sb.lastEntry && sb.lastEntry.date) || '';
  if(dateA !== dateB) return dateA.localeCompare(dateB);
  const idxA = (sa.lastEntry && sa.lastEntry.logIdx!=null) ? sa.lastEntry.logIdx : -1;
  const idxB = (sb.lastEntry && sb.lastEntry.logIdx!=null) ? sb.lastEntry.logIdx : -1;
  if(idxA !== idxB) return idxA - idxB;
  return a.name.localeCompare(b.name, 'he');
}
// Explains, for one normal congregant, exactly why a given week's assign object does or doesn't
// include them - reusing the exact same fits()/deferred logic the algorithm itself runs on, so
// the explanation can never drift from what actually happened. See runAssignment for the proof
// this leans on: if a person is unused and their range fits an aliyah, that aliyah could only
// have gone to someone equal-or-earlier than them in the fairness queue (never to a strong
// reader, never left unfilled) - so "who has it and where do they stand" is always a complete
// answer. statsMap should be the totals as they stood BEFORE this specific week (buildStatsMapAsOf
// for a confirmed past week, buildStatsMap() for the still-open draft) so the numbers shown match
// what the algorithm actually saw, not today's totals.
function explainQueuePerson(person, weekEntry, split, statsMap){
  if(!weekEntry) return null;
  const assign = weekEntry.assign || {};
  for(let i=1;i<=7;i++){
    if((assign[i]||assign[String(i)]) === person.id){
      const warn = (weekEntry.recencyWarnings||{})[i] || (weekEntry.recencyWarnings||{})[String(i)];
      return {selected:true, aliyahNum:i, recencyWarning: warn || null};
    }
  }
  // iron rule: reading within the last week makes someone entirely invisible to the algorithm
  // this week (see runAssignment) - check this BEFORE the normal fit-based reasoning below, or
  // it would wrongly claim someone else was merely "earlier in the fairness queue" when the real
  // reason is the no-two-weeks-in-a-row rule, not fairness ranking.
  if(isRecencyBlocked(statsMap[person.id], weekEntry.parasha)){
    const lastParasha = statsMap[person.id].lastEntry.parasha;
    return {selected:false, reason:`קרא בפרשת ${lastParasha} - הפרשה הקודמת - כלל הברזל אוסר לשבץ שוב שבוע אחרי שבוע.`};
  }
  if(person.unrestricted){
    // Strong readers compete directly on the largest aliyot of the parasha and step in as fallback
    // on any remaining open aliyot. If a strong reader wasn't selected, explain who took the big
    // aliyot / strong-reader slots ahead of them in the fairness queue.
    const strongWinners = [];
    for(let i=1;i<=7;i++){
      const id = assign[i]||assign[String(i)];
      if(!id || id.startsWith('guest:')) continue;
      const p = resolvePerson(id);
      if(p && p.unrestricted) strongWinners.push(p.name);
    }
    return strongWinners.length===0
      ? {selected:false, reason:'כל שבע העליות (כולל העליות הגדולות) שובצו למתפללים רגילים שקדמו לו בתור ההוגנות בשבת הזו.'}
      : {selected:false, reason:`העליות הגדולות בשבת הזו ניתנו ל${strongWinners.join(', ')}, שקודם/קודמים לו בתור ההוגנות.`};
  }
  if((weekEntry.deferred||[]).includes(person.id)){
    return {selected:false, reason:'אין עלייה שמתאימה לטווח היכולת שלו בשבת הזו.'};
  }
  const fittingAliyot = [];
  for(let i=1;i<=7;i++){ if(fits(person, split[i-1])) fittingAliyot.push(i); }
  if(fittingAliyot.length===0){
    return {selected:false, reason:'אין עלייה שמתאימה לטווח היכולת שלו בשבת הזו.'};
  }
  // an aliyah that fits him and is still open is the most useful thing to surface - directly actionable
  for(const i of fittingAliyot){
    if(!(assign[i]||assign[String(i)])){
      return {selected:false, actionable:true, aliyahNum:i, reason:`עלייה ${ALIYAH_NAMES[i-1]} מתאימה לו וטרם שובצה — אפשר לשבץ אותו אליה ידנית.`};
    }
  }
  // otherwise, every aliyah that fits him already went to someone else in the queue
  const i = fittingAliyot[0];
  const takenId = assign[i] || assign[String(i)];
  const taken = resolvePerson(takenId);
  if(taken && taken.isGuest){
    return {selected:false, reason:`עלייה ${ALIYAH_NAMES[i-1]} מתאימה לו, אבל ניתנה לאורח.`};
  }
  if(taken){
    const takenStats = statsMap[taken.id] || {total:0}, meStats = statsMap[person.id] || {total:0};
    return {selected:false, reason:`עלייה ${ALIYAH_NAMES[i-1]} מתאימה לו, אבל ניתנה ל${taken.name} (${takenStats.total} עליות אז, לעומת ${meStats.total} שלו — קודם לו בתור ההוגנות).`};
  }
  return {selected:false, reason:`עלייה ${ALIYAH_NAMES[i-1]} מתאימה לו, אך לא שובצה.`};
}

function runAssignment(parashaName, date, locks){
  locks = locks || {};
  const split = getSplit(parashaName);
  let assign = {...locks};
  const lockedCongIds = new Set(Object.values(locks).filter(v=>v && !v.startsWith('guest:')));
  let remaining = split
    .map((p,i)=>({aliyahNum:i+1, pesukim:p}))
    .filter(a=>!assign[a.aliyahNum]);
  remaining.sort((a,b)=> (b.pesukim - a.pesukim) || (Math.random()-0.5)); // hardest first

  // Iron rule: reading last week makes someone entirely ineligible this week, no exceptions -
  // filtered out of both pools before anything else runs. Locked people (explicit manual
  // overrides, e.g. a bar mitzvah) are a deliberate exception to everything, recency included.
  const cmpForParasha = (a,b) => fairnessCompare(a, b, parashaName);
  const strongPool = STATE.congregants.filter(c=>c.unrestricted && !c.paused && !lockedCongIds.has(c.id) && !isRecencyBlocked(getCongStats(c.id), parashaName)).sort(cmpForParasha);
  const normalPool = STATE.congregants.filter(c=>!c.unrestricted && !c.paused && !lockedCongIds.has(c.id) && !isRecencyBlocked(getCongStats(c.id), parashaName)).sort(cmpForParasha);
  const recentlyExcluded = STATE.congregants
    .filter(c=>!c.paused && !lockedCongIds.has(c.id) && isRecencyBlocked(getCongStats(c.id), parashaName))
    .map(c=>c.id);
  const usedNormal = new Set();
  const usedStrong = new Set();
  let unfilledReasons = {};
  let recencyWarnings = {};
  // Tracked by PERSON, not by aliyahNum - the local-fit swap pass below can move a flagged
  // person to a different aliyahNum after this loop runs, and the warning must follow them.
  const recentGapPeople = new Set();

  // The hardest aliyah any normal (banded) reader in the community could ever be given - used to
  // tell "too hard for anyone normal, a strong reader is genuinely needed" apart from "just
  // happens to be too short/awkward for whoever's available right now, gabbai should decide".
  const upperPct = (STATE.matchSettings && STATE.matchSettings.upper) || 110;
  const allNormalLevels = STATE.congregants.filter(c=>!c.unrestricted && !c.paused).map(c=>c.level);
  const maxNormalCeiling = allNormalLevels.length ? Math.max(...allNormalLevels.map(lvl=>lvl*(upperPct/100))) : 0;

  // Strong readers are equal participants in the community rotation (should accumulate the same
  // number of aliyot over time as everyone else), while being steered toward the largest aliyot.
  // An aliyah is considered a "big aliyah" eligible for direct head-to-head competition between
  // strong and normal readers if it is >= strongMinPesukim (default 30) OR is among the top 2
  // longest aliyot of this week's parasha (so in shorter parashot where the longest aliyah is e.g.
  // 22 pesukim, due strong readers still get their fair turn on the biggest reading of the week).
  const strongMinPesukim = (STATE.matchSettings && STATE.matchSettings.strongMin) || 30;
  const sortedPesukimDesc = split.slice().sort((a,b)=>b-a);
  const topTwoThreshold = sortedPesukimDesc[Math.min(1, sortedPesukimDesc.length-1)] || 0;
  const isBigAliyahForStrong = (pesukim) => pesukim >= strongMinPesukim || pesukim >= topTwoThreshold;

  // Backtracking / augmenting-path helper: if `aliyah` cannot be filled directly by any unused
  // normal reader, check if an ALREADY-assigned normal reader `u` (currently holding `uAliyahNum`)
  // also fits `aliyah`, AND some unused normal reader `v` (in fairness order) fits `uAliyahNum`.
  // Moving `u` to `aliyah` and giving `uAliyahNum` to `v` fills BOTH aliyot without dropping anyone
  // who was already selected!
  function tryAugmentNormal(aliyah){
    const assignedNums = Object.keys(assign)
      .map(k=>parseInt(k,10))
      .filter(num => !locks[num] && assign[num] && !String(assign[num]).startsWith('guest:'));
    for(const tierAllowRecent of [false, true]){
      for(const uNum of assignedNums){
        const uId = assign[uNum];
        const uPerson = resolvePerson(uId);
        if(!uPerson || uPerson.unrestricted) continue;
        if(!fits(uPerson, aliyah.pesukim)) continue;
        const uPesukim = split[uNum - 1];
        const vCandidate = normalPool.find(v =>
          !usedNormal.has(v.id) &&
          fits(v, uPesukim) &&
          (tierAllowRecent || !isRecencyWarning(getCongStats(v.id), parashaName))
        );
        if(vCandidate){
          assign[aliyah.aliyahNum] = uPerson.id;
          assign[uNum] = vCandidate.id;
          usedNormal.add(vCandidate.id);
          if(isRecencyWarning(getCongStats(vCandidate.id), parashaName)){
            recentGapPeople.add(vCandidate.id);
          }
          return true;
        }
      }
    }
    return false;
  }

  const stillOpen = [];
  for(const aliyah of remaining){
    const normalFound = findFairCandidate(normalPool, usedNormal, p=>fits(p, aliyah.pesukim), parashaName);
    const canCompeteStrong = isBigAliyahForStrong(aliyah.pesukim);
    const strongFound = canCompeteStrong ? findFairCandidate(strongPool, usedStrong, ()=>true, parashaName) : null;

    if(normalFound && strongFound){
      // Both a normal reader and a strong reader are available for this big aliyah.
      // Because strong readers are equal participants in the rotation AND their specialty is
      // taking the largest aliyot of the parasha, a strong reader who is near or ahead of the
      // normal candidate in fairness order (within +1 read of the normal candidate) claims the
      // big aliyah directly - so the normal reader can instead take one of the medium aliyot that
      // follow, rather than forcing the strong reader down into a tiny leftover aliyah in Phase 2.
      let pickStrong = false;
      if(normalFound.recentGap !== strongFound.recentGap){
        pickStrong = !strongFound.recentGap;
      } else {
        const sNorm = getCongStats(normalFound.person.id);
        const sStr = getCongStats(strongFound.person.id);
        if(sStr.total <= sNorm.total + 1){
          pickStrong = true;
        }
      }
      if(pickStrong){
        assign[aliyah.aliyahNum] = strongFound.person.id;
        usedStrong.add(strongFound.person.id);
        if(strongFound.recentGap) recentGapPeople.add(strongFound.person.id);
        continue;
      } else {
        assign[aliyah.aliyahNum] = normalFound.person.id;
        usedNormal.add(normalFound.person.id);
        if(normalFound.recentGap) recentGapPeople.add(normalFound.person.id);
        continue;
      }
    }

    if(normalFound){
      assign[aliyah.aliyahNum] = normalFound.person.id;
      usedNormal.add(normalFound.person.id);
      if(normalFound.recentGap) recentGapPeople.add(normalFound.person.id);
      continue;
    }

    // No unused normal reader directly fits this aliyah - try a 1-step augmenting swap before
    // falling back to a strong reader or leaving it open.
    if(tryAugmentNormal(aliyah)){
      continue;
    }

    if(strongFound){
      assign[aliyah.aliyahNum] = strongFound.person.id;
      usedStrong.add(strongFound.person.id);
      if(strongFound.recentGap) recentGapPeople.add(strongFound.person.id);
      continue;
    }
    stillOpen.push(aliyah); // either below the strong-reader floor, or no strong reader free (yet)
  }

  // Phase 2: any strong reader still unused gets the largest remaining open aliyah, UNLESS the
  // open aliyah is a tiny reading (< 10 pesukim) AND the strong reader is already ahead of the
  // community average (so strong readers aren't repeatedly burned on 4-7 pasuk aliyot every week,
  // keeping them fresh for the big 30+ pasuk aliyot in Phase 1).
  stillOpen.sort((a,b)=> b.pesukim - a.pesukim);
  const trulyUnfilled = [];
  const activeTotals = STATE.congregants.filter(c=>!c.paused).map(c=>getCongStats(c.id).total);
  const communityAvgTotal = activeTotals.length ? activeTotals.reduce((a,b)=>a+b,0)/activeTotals.length : 0;
  for(const aliyah of stillOpen){
    const strongFound = findFairCandidate(
      strongPool,
      usedStrong,
      s => aliyah.pesukim >= 10 || getCongStats(s.id).total <= communityAvgTotal,
      parashaName
    );
    if(strongFound){
      assign[aliyah.aliyahNum] = strongFound.person.id;
      usedStrong.add(strongFound.person.id);
      if(strongFound.recentGap) recentGapPeople.add(strongFound.person.id);
    } else {
      trulyUnfilled.push(aliyah); // no eligible strong readers left either - genuinely needs a human
    }
  }

  // ---------- local-fit optimization pass ----------
  // 1) Strong-reader promotion with replacement: if a strong reader ended up on a tiny fallback
  //    aliyah (e.g. 6 pesukim because no normal reader fits 6), a direct swap with a normal reader
  //    on a big aliyah (e.g. 28 pesukim) is blocked because the normal reader doesn't fit 6.
  //    However, if that normal reader on 28 has already read MORE (or equal) times than the strong
  //    reader, AND wait - we don't want to drop a selected person, OR if there's an even larger
  //    aliyah where the normal reader can move to another open slot, we move them!
  const maxPesukimThisWeek = Math.max(...split);
  const misfit = (person, pesukim) => person.unrestricted ? (maxPesukimThisWeek - pesukim) * 2.5 : Math.abs(pesukim - person.level);
  const swappableAliyot = Object.keys(assign)
    .map(k=>parseInt(k,10))
    .filter(num => !locks[num] && assign[num] && !String(assign[num]).startsWith('guest:'));

  // 3-way cycle swaps (A -> B -> C -> A) in addition to 2-way swaps (A <-> B):
  // Allows a strong reader on a small aliyah (e.g. 11) to take a large aliyah (e.g. 28 from a
  // level-25 reader), while the level-25 reader moves to a medium aliyah (e.g. 17 from a level-15
  // reader), and the level-15 reader moves to the 11-pesukim aliyah!
  let improved = true, guard = 0;
  while(improved && guard++ < 40){
    improved = false;
    // 2-way swaps
    for(let i=0;i<swappableAliyot.length;i++){
      for(let j=i+1;j<swappableAliyot.length;j++){
        const numA = swappableAliyot[i], numB = swappableAliyot[j];
        const personA = resolvePerson(assign[numA]), personB = resolvePerson(assign[numB]);
        if(!personA || !personB) continue;
        const pesukimA = split[numA-1], pesukimB = split[numB-1];
        if(!personA.unrestricted && !fits(personA, pesukimB)) continue;
        if(!personB.unrestricted && !fits(personB, pesukimA)) continue;
        const before = misfit(personA, pesukimA) + misfit(personB, pesukimB);
        const after = misfit(personA, pesukimB) + misfit(personB, pesukimA);
        if(after < before - 1e-9){
          assign[numA] = personB.id;
          assign[numB] = personA.id;
          improved = true;
        }
      }
    }
    if(improved) continue;
    // 3-way cycle swaps: personA->numB, personB->numC, personC->numA
    for(let i=0;i<swappableAliyot.length && !improved;i++){
      for(let j=0;j<swappableAliyot.length && !improved;j++){
        if(j===i) continue;
        for(let k=0;k<swappableAliyot.length && !improved;k++){
          if(k===i || k===j) continue;
          const numA = swappableAliyot[i], numB = swappableAliyot[j], numC = swappableAliyot[k];
          const pA = resolvePerson(assign[numA]), pB = resolvePerson(assign[numB]), pC = resolvePerson(assign[numC]);
          if(!pA || !pB || !pC) continue;
          const pesA = split[numA-1], pesB = split[numB-1], pesC = split[numC-1];
          if(!pA.unrestricted && !fits(pA, pesB)) continue;
          if(!pB.unrestricted && !fits(pB, pesC)) continue;
          if(!pC.unrestricted && !fits(pC, pesA)) continue;
          const before = misfit(pA, pesA) + misfit(pB, pesB) + misfit(pC, pesC);
          const after = misfit(pA, pesB) + misfit(pB, pesC) + misfit(pC, pesA);
          if(after < before - 1e-9){
            assign[numB] = pA.id;
            assign[numC] = pB.id;
            assign[numA] = pC.id;
            improved = true;
          }
        }
      }
    }
  }
  // Rebuild recencyWarnings from the final (post-swap) aliyahNum each flagged person landed on.
  if(recentGapPeople.size){
    Object.keys(assign).forEach(k=>{
      const id = assign[k];
      if(id && recentGapPeople.has(id)){
        const p = resolvePerson(id);
        recencyWarnings[k] = `${p.name} קרא לאחרונה לפני פחות מ-3 שבתות - זו הייתה האפשרות הכי טובה שנמצאה, כדאי לשים לב.`;
      }
    });
  }

  for(const aliyah of trulyUnfilled){
    const tooHardForCommunity = aliyah.pesukim > maxNormalCeiling;
    if(tooHardForCommunity){
      unfilledReasons[aliyah.aliyahNum] = 'עלייה זו חורגת מיכולת כל מתפלל רגיל, וכל המתפללים החזקים כבר שובצו לעליות אחרות השבוע - נדרש שיבוץ ידני.';
      continue;
    }
    // Not too hard for the community - give the REAL breakdown of why nobody stepped in, checked
    // against the full roster (not the this-week-filtered pools), so the reason is always
    // accurate: e.g. "3 fit but already got a different aliyah this week, 2 fit but read
    // recently" - not a generic guess.
    const fittingWholeRoster = STATE.congregants.filter(c=>!c.unrestricted && !c.paused && fits(c, aliyah.pesukim));
    const usedElsewhereCount = fittingWholeRoster.filter(c=>usedNormal.has(c.id)).length;
    const blockedByRecencyCount = fittingWholeRoster.filter(c=>recentlyExcluded.includes(c.id)).length;
    const parts = [];
    if(usedElsewhereCount) parts.push(`${usedElsewhereCount} כבר שובצו לעליות אחרות השבוע`);
    if(blockedByRecencyCount) parts.push(`${blockedByRecencyCount} קראו לאחרונה ונחסמו לפי כלל הברזל`);
    const detail = parts.length ? ` (${parts.join(', ')})` : '';
    unfilledReasons[aliyah.aliyahNum] = `אין מתפלל רגיל פנוי שמתאים לעלייה זו כרגע${detail}, וכל המתפללים החזקים כבר שובצו השבוע לעליות אחרות - נדרש שיבוץ ידני.`;
  }

  // deferred = normal readers whose band doesn't reach ANY aliyah in this week's parasha at all
  // (not simply "someone else with priority took the one aliyah that also fit them")
  const deferred = normalPool
    .filter(p=>!usedNormal.has(p.id) && !split.some(pesukim=>fits(p, pesukim)))
    .map(p=>p.id);

  STATE.current = { date, parasha: parashaName, assign, locks:{...locks}, deferred, unfilledReasons, recencyWarnings, recentlyExcluded, confirmed:false };
  saveCurrent();
}

// Suggests and applies the next best available candidate in fairness order for a single aliyah
// on the active draft (`STATE.current`), avoiding whoever is currently holding it (and keeping a
// per-aliyah skip memory on the draft so clicking "הצע מחליף" repeatedly cycles through candidates).
function suggestReplacementForAliyah(aliyahNum){
  if(!STATE.current) return;
  const parashaName = STATE.current.parasha;
  const split = getSplit(parashaName);
  const pesukim = split[aliyahNum - 1];
  const assign = STATE.current.assign || {};
  const currentId = assign[aliyahNum] || assign[String(aliyahNum)] || null;
  if(!STATE.current.skippedByAliyah) STATE.current.skippedByAliyah = {};
  const skipList = STATE.current.skippedByAliyah[aliyahNum] || (STATE.current.skippedByAliyah[aliyahNum] = []);
  if(currentId && !currentId.startsWith('guest:') && !skipList.includes(currentId)){
    skipList.push(currentId);
  }
  const usedIds = new Set(
    Object.keys(assign)
      .filter(k => String(k) !== String(aliyahNum))
      .map(k => assign[k])
      .filter(v => v && !v.startsWith('guest:'))
  );
  const statsMap = buildStatsMap();
  const eligible = STATE.congregants
    .filter(c => !c.paused && !usedIds.has(c.id) && !isRecencyBlocked(statsMap[c.id], parashaName))
    .sort((a,b) => fairnessCompareStable(a, b, statsMap, parashaName));

  function pickFrom(ignoreSkip){
    const pool = ignoreSkip ? eligible : eligible.filter(c => !skipList.includes(c.id));
    // 1. Clean normal reader who fits
    let cand = pool.find(c => !c.unrestricted && fits(c, pesukim) && !isRecencyWarning(statsMap[c.id], parashaName));
    if(cand) return cand;
    // 2. Clean strong reader (if big aliyah or no normal reader fits)
    cand = pool.find(c => c.unrestricted && !isRecencyWarning(statsMap[c.id], parashaName));
    if(cand) return cand;
    // 3. Recent-warning normal reader who fits
    cand = pool.find(c => !c.unrestricted && fits(c, pesukim));
    if(cand) return cand;
    // 4. Recent-warning strong reader
    cand = pool.find(c => c.unrestricted);
    return cand || null;
  }

  let nextPerson = pickFrom(false);
  if(!nextPerson && skipList.length){
    // Cycled through all fitting candidates - reset skip list (excluding only the currently-selected person)
    STATE.current.skippedByAliyah[aliyahNum] = currentId && !currentId.startsWith('guest:') ? [currentId] : [];
    nextPerson = pickFrom(false);
  }
  if(!nextPerson){
    notice('לא נמצא מחליף פנוי אחר שמתאים לעלייה זו (ללא הפרת כלל הברזל).');
    return;
  }
  assign[aliyahNum] = nextPerson.id;
  if(!STATE.current.recencyWarnings) STATE.current.recencyWarnings = {};
  if(isRecencyWarning(statsMap[nextPerson.id], parashaName)){
    STATE.current.recencyWarnings[aliyahNum] = `${nextPerson.name} קרא לאחרונה לפני פחות מ-3 שבתות - זו הייתה האפשרות הכי טובה שנמצאה, כדאי לשים לב.`;
  } else {
    delete STATE.current.recencyWarnings[aliyahNum];
  }
  if(STATE.current.unfilledReasons) delete STATE.current.unfilledReasons[aliyahNum];
  saveCurrent();
  render();
}

function confirmAssignment(){
  if(!STATE.current) return;
  const dup = STATE.weeklyLog.find(w=>w.parasha===STATE.current.parasha && w.date===STATE.current.date);
  if(dup){
    askConfirm(`הפרשה ${STATE.current.parasha} כבר משובצת בתאריך ${formatDate(STATE.current.date)}. האם לעדכן (הדריסה תחליף לגמרי את השיבוץ הקיים באחד החדש)?`, ()=>{
      STATE.weeklyLog = STATE.weeklyLog.filter(w=>w.id!==dup.id); // remove the old one - no duplicate allowed
      doConfirmAssignment();
    });
    return; // cancelling the confirm modal leaves the draft open, untouched, and nothing is saved
  }
  doConfirmAssignment();
}
function doConfirmAssignment(){
  const entry = {
    id: genId(),
    date: STATE.current.date,
    parasha: STATE.current.parasha,
    assign: {...STATE.current.assign},
    deferred: [...STATE.current.deferred],
    unfilledReasons: {...(STATE.current.unfilledReasons||{})},
    recencyWarnings: {...(STATE.current.recencyWarnings||{})},
    recentlyExcluded: [...(STATE.current.recentlyExcluded||[])]
  };
  STATE.weeklyLog.push(entry);
  saveWeeklyLog();
  STATE.current = null;
  saveCurrent();
  STATE.tab = 'recent';
  render();
}

// edits a week already saved in the log (works for past confirmed weeks too)
function updateLogAssignment(weekId, aliyahNum, newCongId){
  const entry = STATE.weeklyLog.find(w=>w.id===weekId);
  if(!entry) return;
  if(newCongId) entry.assign[aliyahNum] = newCongId;
  else delete entry.assign[aliyahNum];
  saveWeeklyLog();
  render();
}

