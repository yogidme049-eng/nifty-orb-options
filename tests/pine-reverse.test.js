const assert=require('node:assert/strict');
const {backtest}=require('../site/signal-engine.js');
const E=require('../site/options-engine.js');
const p={strategy:'pine_sl_reverse',start:560,end:570,pineExit:910,target:2,stop:1,maxEntries:2,cost:0};
function day(edits={}){const bars=[];for(let t=560;t<=910;t++){let b=t<=570?[100,110,100,105]:[105,109,101,105];if(edits[t])b=edits[t];bars.push([t,...b.map(x=>Math.round(x*100))]);}return {d:'2026-09-25',bars,pdh:111,pdl:99,pc:105,ema:105};}
function run(edits,settings={}){return backtest([day(edits)],{...p,...settings}).trades;}
// Ignore pre-10AM breakout, enter at 10:00 close, reverse immediately on SL.
let ts=run({580:[112,113,111,112],600:[112,113,111,112],601:[105,115,101,108],602:[101,105,95,100]});
assert.equal(ts.length,2);assert.equal(ts[0].entry_bar,600);assert.equal(ts[0].exit_bar,601);
assert.equal(ts[1].entry_bar,601);assert.equal(ts[1].entry,102);assert.equal(ts[1].side,'SHORT');
assert.equal(ts[1].stop,112);assert.equal(ts[1].target,82);assert.ok(ts[1].exit_bar>601);
// No breakout/PDL condition on reversal, and no check on reversal candle (high 115).
assert.equal(ts[1].exit_reason,'Time exit');assert.equal(ts[1].exit_bar,909);
assert.equal(run({600:[112,113,111,112],601:[105,115,101,108]},{maxEntries:1}).length,1);
// Gap uses open for stop and reversal entry.
ts=run({600:[112,113,111,112],601:[98,106,95,100]});assert.equal(ts[1].entry,98);assert.equal(ts[1].stop,108);
// Target exit does not reverse; opening profit gap wins over later stop touch.
ts=run({600:[112,113,111,112],601:[135,140,100,120]});assert.equal(ts.length,1);assert.equal(ts[0].exit_reason,'Target');assert.equal(ts[0].exit,132);
// Ambiguous non-gap SL/target bar chooses SL; second SL cannot trigger a third trade.
ts=run({600:[112,113,111,112],601:[112,135,100,110],602:[113,120,80,110]});assert.equal(ts.length,2);assert.equal(ts[0].ambiguous,true);assert.equal(ts[1].exit_reason,'Stop gap');
// Equality is not a breakout, strict previous-day filter, deadline SL cannot reverse.
assert.equal(run({600:[111,112,110,111]}).length,0);
ts=run({908:[112,113,111,112],909:[105,110,101,105]});assert.equal(ts.length,1);
const missing=day();missing.bars=missing.bars.filter(b=>b[0]!==565);assert.equal(backtest([missing],p).audit[0].status,'Incomplete required minutes');
// Option reversal executes at same snapshot as first exit, second lots applied.
ts=run({600:[112,113,111,112],601:[105,115,101,108],602:[113,115,100,110]});
const quotes=[];for(const minute of [601,602,603])for(const type of ['CE','PE'])quotes.push({date:'2026-09-25',minute,type,expiry:'2026-09-29',strike:100,price:100+minute-601,lot:65});
const op={maxDelay:0,expiryIndex:0,strikeStep:50,tolerance:10,useDataLot:true,slippage:0,fee:0,legs:[{side:'buy',type:'follow',select:'premium',premium:100,lots:1,secondLots:3}]};
const result=E.simulate(ts,quotes,op);assert.equal(result.trades.length,2);assert.equal(result.trades[0].exit_minute,result.trades[1].entry_minute);assert.equal(result.legs[1].quantity,195);
const skipped=E.simulate(ts,quotes.filter(q=>!(q.minute===601&&q.type==='CE')),op);assert.equal(skipped.trades.length,0);
console.log('Pine reversal: timing, gap priority, SL priority, one/two entries, missing data and option-fill/lot tests passed.');
// Completed 3/5-minute confirmation, no early intermediate breakout entry.
for(const tf of [1,3,5]){
 const changes={};for(let t=600;t<=604;t++)changes[t]=[112,113,111,112];
 const a=run(changes,{entryMinutes:tf,maxEntries:1});assert.equal(a[0].entry_bar,600+tf-1);
}
assert.equal(run({600:[112,113,111,112]},{entryMinutes:3}).length,0);
assert.equal(run({600:[112,113,111,112]},{entryMinutes:5}).length,0);
// 3-minute first entry confirms 10:03; SL reversal confirms next 1-min bar, not 10:06.
let tfTrades=run({602:[112,113,111,112],603:[105,115,101,108]},{entryMinutes:3});
assert.equal(tfTrades[1].entry_bar,603);
for(const strategy of ['pdh','pdh_early','orb_boundary','orb_boundary_pdh','ema']){
 const d=day({600:[112,113,111,112],601:[112,113,111,112],602:[112,113,111,112],603:[112,113,111,112],604:[112,113,111,112]});d.pc=106;
 for(const tf of [3,5]){const a=backtest([d],{...p,strategy,entryMinutes:tf,filter:10,maxEntries:1}).trades;assert.equal(a[0].entry_bar,600+tf-1);}
}
console.log('Entry timeframe tests passed for all strategies; immediate Pine reversal unchanged.');
// Plain ORB has no previous-day requirement or 10AM gate.
const plainDay=day({571:[112,113,111,112],572:[112,113,111,112],573:[112,113,111,112],574:[112,113,111,112],575:[112,113,111,112],576:[112,113,111,112],577:[112,113,111,112],578:[112,113,111,112],579:[112,113,111,112]});
plainDay.pdh=null;plainDay.pdl=null;
for(const [tf,expected] of [[1,571],[3,575],[5,579]]){
 const t=backtest([plainDay],{...p,strategy:'orb',entryMinutes:tf,maxEntries:1}).trades;
 assert.equal(t[0].entry_bar,expected);assert.equal(t[0].side,'LONG');assert.equal(t[0].risk,10);
}
console.log('Plain ORB: no filters, no 10AM wait, 1/3/5-minute confirmations passed.');
// PDH-only: no ORB dependency, fixed 50/100 risk despite custom ORB settings.
for(const side of [1,-1])for(const tf of [1,3,5]){
 const d=day();d.pdh=200;d.pdl=100;d.bars=d.bars.filter(b=>b[0]>=571).map(b=>[b[0],...((side===1?[201,205,195,201]:[99,105,95,99]).map(x=>x*100))]);
 const a=backtest([d],{...p,strategy:'pdh_fixed',start:900,end:905,stop:9,target:9,entryMinutes:tf,maxEntries:1}).trades;
 assert.equal(a.length,1);assert.equal(a[0].entry_bar,({1:571,3:575,5:579})[tf]);assert.equal(a[0].risk,50);assert.equal(a[0].stop,a[0].entry-side*50);assert.equal(a[0].target,a[0].entry+side*100);
 assert.equal(a[0].orb_high,null);
}
const fixedMissing=day();fixedMissing.pdh=null;assert.equal(backtest([fixedMissing],{...p,strategy:'pdh_fixed'}).audit[0].status,'Missing previous-day levels');
console.log('PDH/PDL-only fixed 50/100: long, short, 1/3/5-minute and missing PDH tests passed.');

const customDay=day();customDay.bars=customDay.bars.filter(b=>b[0]>=571).map(b=>[b[0],11200,11300,11100,11200]);
const custom=backtest([customDay],{...p,strategy:'pdh_fixed',slPoints:30,targetPoints:75,maxEntries:1}).trades[0];
assert.equal(custom.entry_bar,571);assert.equal(custom.stop,82);assert.equal(custom.target,187);assert.equal(custom.risk,30);
assert.throws(()=>backtest([customDay],{...p,strategy:'pdh_fixed',slPoints:0}),/positive/);
console.log('Editable PDH points and after-09:30 entry tests passed.');
for(const [entryAfter,tf,expected] of [[600,1,601],[600,3,605],[600,5,609],[570,1,571]]){
 const t=backtest([customDay],{...p,strategy:'pdh_fixed',entryAfter,entryMinutes:tf,maxEntries:1}).trades[0];
 assert.equal(t.entry_bar,expected);
}
assert.throws(()=>backtest([customDay],{...p,strategy:'pdh_fixed',entryAfter:910}),/Entry after/);
console.log('Editable entry-after time: 1/3/5-minute alignment and invalid time tests passed.');
