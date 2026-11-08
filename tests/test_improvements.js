const fs = require('fs');
const logicCode = fs.readFileSync('/home/noam/shibutz-aliyot/tests/_logic.js', 'utf8');
eval(logicCode);

function assert(cond, msg){
  if(!cond){
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// 1. Test combined parasha gap (e.g. ויקהל-פקודי -> ויקרא must be 1, not 2!)
assert(parashaGap('ויקהל-פקודי', 'ויקרא') === 1, `Expected gap 1 from ויקהל-פקודי to ויקרא, got ${parashaGap('ויקהל-פקודי', 'ויקרא')}`);
assert(parashaGap('תזריע-מצורע', 'אחרי מות') === 1, `Expected gap 1 from תזריע-מצורע to אחרי מות, got ${parashaGap('תזריע-מצורע', 'אחרי מות')}`);
assert(parashaGap('תזריע-מצורע', 'אחרי מות-קדושים') === 1, `Expected gap 1 from תזריע-מצורע to אחרי מות-קדושים, got ${parashaGap('תזריע-מצורע', 'אחרי מות-קדושים')}`);
assert(parashaGap('אחרי מות-קדושים', 'אמור') === 1, `Expected gap 1 from אחרי מות-קדושים to אמור, got ${parashaGap('אחרי מות-קדושים', 'אמור')}`);
assert(parashaGap('בהר-בחוקותי', 'במדבר') === 1, `Expected gap 1 from בהר-בחוקותי to במדבר, got ${parashaGap('בהר-בחוקותי', 'במדבר')}`);
assert(parashaGap('מטות-מסעי', 'דברים') === 1, `Expected gap 1 from מטות-מסעי to דברים, got ${parashaGap('מטות-מסעי', 'דברים')}`);
assert(parashaGap('נצבים-וילך', 'האזינו') === 1, `Expected gap 1 from נצבים-וילך to האזינו, got ${parashaGap('נצבים-וילך', 'האזינו')}`);
console.log('✅ Test 1 passed: Combined parasha gap & iron rule works accurately.');

// 2. Test same-date insertion order in aggregateStatsFromLog
STATE.congregants = [{id:'c1', name:'Test', level:20, unrestricted:false}];
STATE.weeklyLog = [
  {id:'w1', date:'2026-08-12', parasha:'בראשית', assign:{'1':'c1'}},
  {id:'w2', date:'2026-08-12', parasha:'נח', assign:{'2':'c1'}},
  {id:'w3', date:'2026-08-12', parasha:'לך לך', assign:{'3':'c1'}}
];
invalidateStatsCache();
const st = getCongStats('c1');
assert(st.lastEntry.parasha === 'לך לך', `Expected lastEntry parasha 'לך לך', got '${st.lastEntry.parasha}'`);
assert(isRecencyBlocked(st, 'וירא') === true, 'Expected c1 to be recency blocked on וירא after reading לך לך');
console.log('✅ Test 2 passed: Same-date insertion order preserved in aggregateStatsFromLog.');

// 3. Test fairnessCompare tiebreaker by recency gap
STATE.congregants = [
  {id:'c_recent', name:'Recent (3 wks ago)', level:20, unrestricted:false},
  {id:'c_old', name:'Old (10 wks ago)', level:20, unrestricted:false}
];
STATE.weeklyLog = [
  {id:'w1', date:'2026-01-01', parasha:'בראשית', assign:{'1':'c_old'}},
  {id:'w2', date:'2026-02-15', parasha:'וישב', assign:{'1':'c_recent'}}
];
invalidateStatsCache();
for(let i=0; i<20; i++){
  const cmp = fairnessCompare(STATE.congregants[0], STATE.congregants[1], 'שמות');
  assert(cmp > 0, 'Expected c_old (read longer ago) to always beat c_recent on equal total');
}
console.log('✅ Test 3 passed: fairnessCompare tiebreaker deterministically prefers whoever read longer ago.');

// 4. Test augmenting path (Lookahead / Bipartite matching)
// Parasha חוקת has split [18,15,17,12,7,11,7] or let's set custom parasha split:
// Suppose 2 open aliyot (others locked): Aliyah 1 = 20 pesukim, Aliyah 2 = 16 pesukim.
// Reader A (0 reads, level 18, fits 65%-130% => 11.7..23.4, fits BOTH 20 and 16).
// Reader B (1 read, level 22, fits 65%-130% => 14.3..28.6? Let's use 80-110% range:
// With 80-110%:
// Reader A (level 18 -> 14.4..19.8) - wait: if A is level 19 -> 80% is 15.2, 110% is 20.9 (fits BOTH 16 and 20).
// Reader B (level 20 -> 80% is 16.0, 110% is 22.0) - make B level 21 -> 80% is 16.8, 110% is 23.1 (fits ONLY 20, NOT 16!).
STATE.matchSettings = {lower:80, upper:110, strongMin:30};
STATE.parashot = {'בדיקה': [20, 16, 10, 10, 10, 10, 10]};
STATE.congregants = [
  {id:'cA', name:'Reader A (fits 16 & 20)', level:19, unrestricted:false},
  {id:'cB', name:'Reader B (fits 20 only)', level:21, unrestricted:false}
];
STATE.weeklyLog = [
  {id:'w0', date:'2026-01-01', parasha:'בראשית', assign:{'1':'cB'}} // cA has 0 reads (first in queue), cB has 1 read
];
invalidateStatsCache();
runAssignment('בדיקה', '2026-05-01', {3:'guest:x',4:'guest:x',5:'guest:x',6:'guest:x',7:'guest:x'});
assert(STATE.current.assign[1] === 'cB' && STATE.current.assign[2] === 'cA',
  `Expected augmenting path to assign cB->1 (20) and cA->2 (16), got 1:${STATE.current.assign[1]}, 2:${STATE.current.assign[2]}`);
console.log('✅ Test 4 passed: Augmenting path resolves greedy bottleneck and fills both aliyot.');

// 5. Full 1,080-week (20-year) sequential cycle simulation with real seed data
STATE.parashot = {};
STATE.matchSettings = {lower:65, upper:130, strongMin:30};
const seeded = seedData();
STATE.weeklyLog = seeded.weeklyLog;
STATE.congregants = seeded.congregants;
invalidateStatsCache();

let ironRuleViolations = 0;
let totalSlots = 0;
let filledSlots = 0;
let strongTotalPesukim = 0;
let strongTotalReads = 0;
let strongNonTinyPesukim = 0;
let strongNonTinyReads = 0;
let normalTotalPesukim = 0;
let normalTotalReads = 0;

const cycleNames = PARASHOT_DEFAULT_TOTALS.slice(0, 54).map(p=>p[0]);
for(let w=0; w<1080; w++){
  const pName = cycleNames[w % 54];
  const prevAssignIds = w > 0 ? new Set(Object.values(STATE.weeklyLog[STATE.weeklyLog.length-1].assign)) : new Set();
  const dateStr = new Date(Date.UTC(2026, 0, 3 + w*7)).toISOString().slice(0,10);
  runAssignment(pName, dateStr, {});
  const cur = STATE.current;
  const split = getSplit(pName);
  for(let a=1; a<=7; a++){
    totalSlots++;
    const cid = cur.assign[a];
    if(cid){
      filledSlots++;
      if(prevAssignIds.has(cid)) ironRuleViolations++;
      const person = resolvePerson(cid);
      if(person.unrestricted){
        strongTotalReads++;
        strongTotalPesukim += split[a-1];
        if(split[a-1] >= 10){
          strongNonTinyReads++;
          strongNonTinyPesukim += split[a-1];
        }
      } else {
        normalTotalReads++;
        normalTotalPesukim += split[a-1];
      }
    }
  }
  doConfirmAssignment();
}

const finalStats = buildStatsMap();
const activeCongs = STATE.congregants.filter(c=>!c.paused);
const strongTotals = activeCongs.filter(c=>c.unrestricted).map(c=>finalStats[c.id].total);
const normalTotals = activeCongs.filter(c=>!c.unrestricted).map(c=>finalStats[c.id].total);
const allTotals = activeCongs.map(c=>finalStats[c.id].total);
const maxT = Math.max(...allTotals), minT = Math.min(...allTotals);
const avgStrongReads = strongTotals.reduce((a,b)=>a+b,0)/strongTotals.length;
const avgNormalReads = normalTotals.reduce((a,b)=>a+b,0)/normalTotals.length;
const avgStrongNonTinyPesukim = strongNonTinyPesukim / strongNonTinyReads;
const avgNormalPesukim = normalTotalPesukim / normalTotalReads;

console.log('--- 1,080-Week (20-Year) Simulation Results ---');
console.log(`Fill rate: ${(filledSlots/totalSlots*100).toFixed(2)}% (${filledSlots}/${totalSlots})`);
console.log(`Iron-rule violations: ${ironRuleViolations}`);
console.log(`Overall fairness spread: ${maxT - minT} (min: ${minT}, max: ${maxT})`);
console.log(`Avg reads per Strong reader: ${avgStrongReads.toFixed(1)} | Avg reads per Normal reader: ${avgNormalReads.toFixed(1)}`);
console.log(`Avg aliyah size for Strong reader (excluding <10 pasuk orphans): ${avgStrongNonTinyPesukim.toFixed(1)} pesukim | Avg aliyah size for Normal reader: ${avgNormalPesukim.toFixed(1)} pesukim`);

assert(ironRuleViolations === 0, 'Expected 0 iron rule violations');
assert(Math.abs(avgStrongReads - avgNormalReads) < 5, 'Expected strong and normal readers to have nearly equal average reads');
assert(avgStrongNonTinyPesukim > avgNormalPesukim + 12, 'Expected strong readers to get significantly larger aliyot on average');

// 6. Test suggestReplacementForAliyah & locks preservation
runAssignment('בראשית', '2026-10-10', {1: 'c1'});
assert(STATE.current.locks && STATE.current.locks[1] === 'c1', 'Expected locks to be saved on STATE.current');
const beforeAliyah2 = STATE.current.assign[2];
suggestReplacementForAliyah(2);
const afterAliyah2 = STATE.current.assign[2];
assert(afterAliyah2 && afterAliyah2 !== beforeAliyah2, `Expected suggestReplacementForAliyah to change aliyah 2 from ${beforeAliyah2} to ${afterAliyah2}`);
console.log('✅ Test 6 passed: suggestReplacementForAliyah and lock persistence work accurately.');
console.log('✅ All 6 tests & 1,080-week simulation passed!');
