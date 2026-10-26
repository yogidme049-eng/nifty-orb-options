/* Offsets are signed strike intervals relative to entry ATM. */
(function(root){
const definitions=[
 ['orb_credit','ORB signal credit spread','Upside: sell ATM PE, buy lower PE. Downside: sell ATM CE, buy higher CE. Hedge distance = width × strike interval.',[['sell','opposite',0],['buy','opposite',1]]],
 ['atm_buy','Directional ATM buy','Buy CE on LONG signals, PE on SHORT signals.',[['buy','follow',0]]],
 ['atm_sell','Directional ATM sell','Sell PE on LONG signals, CE on SHORT signals.',[['sell','opposite',0]]],
 ['long_straddle','Long Straddle','Buy ATM CE and ATM PE.',[['buy','CE',0],['buy','PE',0]]],
 ['short_straddle','Short Straddle','Sell ATM CE and ATM PE.',[['sell','CE',0],['sell','PE',0]]],
 ['long_strangle','Long Strangle','Buy OTM PE below ATM and OTM CE above ATM.',[['buy','PE',-1],['buy','CE',1]]],
 ['short_strangle','Short Strangle','Sell OTM PE below ATM and OTM CE above ATM.',[['sell','PE',-1],['sell','CE',1]]],
 ['bull_call','Bull Call Spread','Buy ATM CE; sell a higher-strike CE. Fixed bullish direction.',[['buy','CE',0],['sell','CE',1]]],
 ['bear_put','Bear Put Spread','Buy ATM PE; sell a lower-strike PE. Fixed bearish direction.',[['buy','PE',0],['sell','PE',-1]]],
 ['bull_put','Bull Put Spread','Sell ATM PE; buy a lower-strike PE. Fixed bullish direction.',[['sell','PE',0],['buy','PE',-1]]],
 ['bear_call','Bear Call Spread','Sell ATM CE; buy a higher-strike CE. Fixed bearish direction.',[['sell','CE',0],['buy','CE',1]]],
 ['iron_condor','Iron Condor','Sell PE one width below ATM and CE one width above; buy wings two widths from ATM.',[['buy','PE',-2],['sell','PE',-1],['sell','CE',1],['buy','CE',2]]],
 ['iron_butterfly','Iron Butterfly','Sell ATM PE and CE; buy PE below ATM and CE above ATM.',[['buy','PE',-1],['sell','PE',0],['sell','CE',0],['buy','CE',1]]]
];
const list=definitions.map(([id,name,description,legs])=>({id,name,description,legs}));
function build(id,width=2,lots=1){const preset=list.find(p=>p.id===id);if(!preset)throw Error('Choose a strategy preset.');if(!Number.isSafeInteger(width)||width<1||width>100)throw Error('Preset width must be 1–100 strike intervals.');if(!Number.isSafeInteger(lots)||lots<1||lots>10000)throw Error('Lots per leg must be 1–10,000.');return preset.legs.map(([side,type,m])=>({side,type,select:'atm',offset:m*width,offsetMode:id==='orb_credit'?'otm':'signed',premium:100,lots}));}
root.OptionPresets={list,build};if(typeof module!=='undefined')module.exports=root.OptionPresets;
})(typeof globalThis!=='undefined'?globalThis:this);
