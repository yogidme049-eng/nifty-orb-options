// Session-aligned completed entry candles. Keep minute exits and snapshot-ready time unchanged.
function entryCloseReady(tm,p,map,earliest){
 const tf=p.entryMinutes??1;
 if(![1,3,5].includes(tf))throw Error('Entry close must be 1, 3 or 5 minutes');
 const first=tm-tf+1;
 if((tm+1-555)%tf!==0||first<earliest)return false;
 for(let t=first;t<=tm;t++)if(!map.has(t))return false;
 return true;
}
// User-requested 10:00 first-entry gate; otherwise signal semantics of the supplied Pine v6 indicator (NIFTY tick = 0.05).
function pineReverseBacktest(days,p){
 const trades=[],audit=[],exitTime=p.pineExit??910;
 const tick=x=>Math.round((x+1e-9)*20)/20;
 if(p.start<555||p.end<p.start||exitTime<=p.end+2||exitTime>930)throw Error('Check Pine ORB and exit times');
 for(const d of days){
  const bars=[...d.bars].sort((a,b)=>a[0]-b[0]),map=new Map(bars.map(b=>[b[0],b]));
  let invalid=!Number.isFinite(d.pdh)||!Number.isFinite(d.pdl)?'Missing previous-day levels':'';
  for(let t=p.start;!invalid&&t<exitTime;t++)if(!map.has(t))invalid='Incomplete required minutes';
  if(map.size!==bars.length)invalid='Duplicate minute bars';
  if(invalid){audit.push({date:d.d,status:invalid});continue;}
  const range=bars.filter(b=>b[0]>=p.start&&b[0]<=p.end);
  const hi=Math.max(...range.map(b=>b[2]/100)),lo=Math.min(...range.map(b=>b[3]/100)),width=hi-lo;
  if(!(width>0)){audit.push({date:d.d,status:'Zero range'});continue;}
  let pos=null,count=0;
  const enter=(side,price,tm)=>{
   const stop=tick(price-side*width),risk=Math.abs(price-stop);
   count++;
   pos={date:d.d,entry_number:count,side:side===1?'LONG':'SHORT',entry_bar:tm,entry:price,
    orb_high:hi,orb_low:lo,risk,stop,target:tick(price+side*risk*p.target),
    previous_day_high:d.pdh,previous_day_low:d.pdl,previous_day_date:d.pd_date,
    entry_basis:count===2?'First SL price / gap open (confirmed at candle close)':'Breakout candle close'};
  };
  for(const b of bars){
   const [tm,...raw]=b,[o,h,l,c]=raw.map(x=>x/100);
   if(tm<=p.end)continue;
   if(pos&&tm>pos.entry_bar){
    const side=pos.side==='LONG'?1:-1;
    let px,why,ambiguous=false;
    if(side===1?o<=pos.stop:o>=pos.stop){px=o;why='Stop gap';}
    else if(side===1?o>=pos.target:o<=pos.target){px=pos.target;why='Target';}
    else if(side===1?l<=pos.stop:h>=pos.stop){px=pos.stop;why='Stop';ambiguous=side===1?h>=pos.target:l<=pos.target;}
    else if(side===1?h>=pos.target:l<=pos.target){px=pos.target;why='Target';}
    else if(tm+1>=exitTime){px=c;why='Time exit';}
    if(why){
     const points=side*(px-pos.entry);
     trades.push({...pos,exit_bar:tm,exit:px,exit_reason:why,ambiguous,gross_points:points,
      net_points:points-(p.cost||0),gross_r:points/pos.risk,net_r:(points-(p.cost||0))/pos.risk,hold_minutes:tm-pos.entry_bar});
     pos=null;
     if(why.startsWith('Stop')&&p.maxEntries===2&&count===1&&tm+1<exitTime)enter(-side,px,tm);
    }
   }else if(!pos&&count===0&&entryCloseReady(tm,p,map,Math.max(600,p.end+1))&&tm+1<exitTime){
    const side=c>hi&&c>d.pdh?1:c<lo&&c<d.pdl?-1:0;
    if(side)enter(side,c,tm);
   }
   if(tm+1>=exitTime)break;
  }
  audit.push({date:d.d,status:count?'Trade':'No breakout'});
 }
 return {trades,audit};
}
function backtest(days,p){
 if(p.strategy==='pine_sl_reverse')return pineReverseBacktest(days,p);
 const fixedPdh=p.strategy==='pdh_fixed';
 if(fixedPdh){const sl=p.slPoints??50,tp=p.targetPoints??100;if(!Number.isFinite(sl)||!Number.isFinite(tp)||sl<=0||tp<=0)throw Error('SL and target points must be positive');const after=p.entryAfter??570;if(!Number.isInteger(after)||after<555||after>=909)throw Error('Entry after time must be 09:15–15:08');p={...p,start:after+1,end:after,stop:1,target:tp/sl};}
 const boundaryMode=['orb_boundary','orb_boundary_pdh'].includes(p.strategy);
 if(boundaryMode)p={...p,start:560,end:570,stop:1,target:2};
 const trades=[],audit=[],pdhMode=fixedPdh||p.strategy==='pdh'||p.strategy==='pdh_early'||p.strategy==='orb_boundary_pdh',emaMode=p.strategy==='ema',pureMode=p.strategy==='orb'||boundaryMode;
 for(const d of days){
  const map=new Map(d.bars.map(b=>[b[0],b])),distance=Math.abs(d.pc/d.ema-1)*100;
  let reason='';
  if(!d.bars.length)reason='No minute data';
  else {for(let t=p.start;t<=910;t++)if(!map.has(t)){reason='Incomplete required minutes';break;}}
  if(!reason&&emaMode&&distance>p.filter)reason='EMA distance filter';
  if(!reason&&emaMode&&d.pc===d.ema)reason='Neutral bias';
  if(!reason&&pdhMode&&(!Number.isFinite(d.pdh)||!Number.isFinite(d.pdl)))reason='Missing previous-day levels';
  const auditRow={date:d.d,status:reason,bars:d.bars.length,ema_distance_pct:distance};
  if(reason){audit.push(auditRow);continue;}
  let hi=fixedPdh?null:-Infinity,lo=fixedPdh?null:Infinity;
  for(let t=p.start;t<=p.end;t++){hi=Math.max(hi,map.get(t)[2]/100);lo=Math.min(lo,map.get(t)[3]/100);}
  let side=!emaMode?0:(d.pc>d.ema?1:-1);const risk=fixedPdh?(p.slPoints??50):(hi-lo)*p.stop;
  if(risk<=0){audit.push({...auditRow,status:'Zero range'});continue;}
  let pos=null,completed=0,firstSide=0;
  for(const bar of d.bars){
   const [tm,...prices]=bar,[o,h,l,c]=prices.map(v=>v/100);
   if(tm<((fixedPdh||boundaryMode||p.strategy==='pdh_early'||p.strategy==='orb')?p.end+1:Math.max(600,p.end+1))||tm>910)continue;
   if(!pos){
    if(!entryCloseReady(tm,p,map,(fixedPdh||boundaryMode||p.strategy==='pdh_early'||p.strategy==='orb')?p.end+1:Math.max(600,p.end+1)))continue;
    if((pureMode||completed)&&tm<910)side=c>hi?1:c<lo?-1:0;
    if(pdhMode&&!fixedPdh&&!completed&&tm<910)side=c>Math.max(hi,d.pdh)?1:c<Math.min(lo,d.pdl)?-1:0;
    if(fixedPdh&&tm<910)side=c>d.pdh?1:c<d.pdl?-1:0;
    if(tm<910&&(!completed||side===-firstSide)&&side!==0&&(fixedPdh||(side===1?c>hi:c<lo))){const entryRisk=boundaryMode?(side===1?c-lo:hi-c):risk;pos={date:d.d,...(p.maxEntries===2?{entry_number:completed+1}:{}),side:side===1?'LONG':'SHORT',entry_bar:tm,entry:c,orb_high:hi,orb_low:lo,risk:entryRisk,stop:boundaryMode?(side===1?lo:hi):c-side*entryRisk,target:c+side*entryRisk*p.target,previous_close:d.pc,previous_ema20:d.ema,ema_distance_pct:distance,...(pdhMode?{previous_day_high:d.pdh,previous_day_low:d.pdl,previous_day_date:d.pd_date}: {})};}
    continue;
   }
   let px,why,ambiguous=false;
   if(side===1?o<=pos.stop:o>=pos.stop){px=o;why='Stop gap';}
   else if(side===1?o>=pos.target:o<=pos.target){px=pos.target;why='Target';}
   else{
    const sh=side===1?l<=pos.stop:h>=pos.stop,th=side===1?h>=pos.target:l<=pos.target;
    if(sh){px=pos.stop;why='Stop';ambiguous=th;}
    else if(th){px=pos.target;why='Target';}
    else if(tm===910){px=c;why='Time exit';}
    else continue;
   }
   const points=side*(px-pos.entry);
   trades.push({...pos,exit_bar:tm,exit:px,exit_reason:why,ambiguous,gross_points:points,net_points:points-p.cost,gross_r:points/pos.risk,net_r:(points-p.cost)/pos.risk,hold_minutes:tm-pos.entry_bar});completed++;firstSide=firstSide||side;if(p.maxEntries!==2||completed>=2||!why.startsWith('Stop'))break;pos=null;
  }
  audit.push({...auditRow,status:completed?'Trade':'No breakout'});
 }
 return {trades,audit};
}
function statistics(ts,key='net_r'){
 const vals=ts.map(t=>t[key]),wins=vals.filter(v=>v>1e-9),losses=vals.filter(v=>v<-1e-9),sum=a=>a.reduce((s,v)=>s+v,0);
 let equity=0,peak=0,dd=0,wr=0,lr=0,mw=0,ml=0,ws='',ls='',wp=[],lp=[],peakDate='Start',ddPeak='',ddTrough='',highIndex=-1,longestUnderwater=0;
 const curve=[],drawdowns=[];
 ts.forEach((t,i)=>{equity+=t[key];if(equity>=peak){peak=equity;peakDate=t.date;highIndex=i;}else longestUnderwater=Math.max(longestUnderwater,i-highIndex);if(peak-equity>dd){dd=peak-equity;ddPeak=peakDate;ddTrough=t.date;}curve.push(equity);drawdowns.push(equity-peak);
  if(t[key]>1e-9){if(!wr)ws=t.date;wr++;lr=0;if(wr>mw){mw=wr;wp=[ws,t.date];}}
  else if(t[key]<-1e-9){if(!lr)ls=t.date;lr++;wr=0;if(lr>ml){ml=lr;lp=[ls,t.date];}}
  else{wr=0;lr=0;}
 });
 return {trades:ts.length,wins:wins.length,losses:losses.length,breakeven:vals.length-wins.length-losses.length,win_rate:ts.length?100*wins.length/ts.length:0,total:sum(vals),expectancy:ts.length?sum(vals)/ts.length:0,profit_factor:losses.length?sum(wins)/-sum(losses):null,max_drawdown:dd,max_winning_streak:mw,max_losing_streak:ml,winning_period:wp,losing_period:lp,average_win:wins.length?sum(wins)/wins.length:0,average_loss:losses.length?sum(losses)/losses.length:0,best:vals.length?Math.max(...vals):0,worst:vals.length?Math.min(...vals):0,curve,drawdowns,ddPeak,ddTrough,longestUnderwater};
}
if(typeof module!=='undefined')module.exports={backtest,statistics};
