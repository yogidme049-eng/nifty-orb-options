function backtest(days,p){
 const boundaryMode=['orb_boundary','orb_boundary_pdh'].includes(p.strategy);
 if(boundaryMode)p={...p,start:560,end:570,stop:1,target:2};
 const trades=[],audit=[],pdhMode=p.strategy==='pdh'||p.strategy==='pdh_early'||p.strategy==='orb_boundary_pdh',emaMode=p.strategy==='ema',pureMode=p.strategy==='orb'||boundaryMode;
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
  let hi=-Infinity,lo=Infinity;
  for(let t=p.start;t<=p.end;t++){hi=Math.max(hi,map.get(t)[2]/100);lo=Math.min(lo,map.get(t)[3]/100);}
  let side=!emaMode?0:(d.pc>d.ema?1:-1);const risk=(hi-lo)*p.stop;
  if(risk<=0){audit.push({...auditRow,status:'Zero range'});continue;}
  let pos=null,completed=0,firstSide=0;
  for(const bar of d.bars){
   const [tm,...prices]=bar,[o,h,l,c]=prices.map(v=>v/100);
   if(tm<((boundaryMode||p.strategy==='pdh_early')?p.end+1:Math.max(600,p.end+1))||tm>910)continue;
   if(!pos){
    if((pureMode||completed)&&tm<910)side=c>hi?1:c<lo?-1:0;
    if(pdhMode&&!completed&&tm<910)side=c>Math.max(hi,d.pdh)?1:c<Math.min(lo,d.pdl)?-1:0;
    if(tm<910&&(!completed||side===-firstSide)&&side!==0&&(side===1?c>hi:c<lo)){const entryRisk=boundaryMode?(side===1?c-lo:hi-c):risk;pos={date:d.d,...(p.maxEntries===2?{entry_number:completed+1}:{}),side:side===1?'LONG':'SHORT',entry_bar:tm,entry:c,orb_high:hi,orb_low:lo,risk:entryRisk,stop:boundaryMode?(side===1?lo:hi):c-side*entryRisk,target:c+side*entryRisk*p.target,previous_close:d.pc,previous_ema20:d.ema,ema_distance_pct:distance,...(pdhMode?{previous_day_high:d.pdh,previous_day_low:d.pdl,previous_day_date:d.pd_date}: {})};}
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
