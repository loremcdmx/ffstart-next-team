(function(){"use strict";
var ranks="AKQJT98765432".split("");
var positions={
 EP:{pct:0,label:"ранняя",hint:"Все одномастные тузы, сильные бродвеи и компактная связанная часть диапазона. Шесть игроков ещё могут ответить."},
 MP:{pct:0,label:"средняя",hint:"Добавляем offsuit-бродвеи и часть младших одномастных королей; руки с частотой рейза не выше 75% остаются за границей."},
 HJ:{pct:0,label:"хайджек",hint:"Четверо за спиной: появляются все одномастные короли, больше offsuit-тузов и связанные руки."},
 CO:{pct:0,label:"катофф",hint:"Открываем все одномастные короли, почти все одномастные дамы и заметно расширяем offsuit-часть."},
 BTN:{pct:0,label:"баттон",hint:"Два блайнда за спиной: весь suited-верх и большинство offsuit-рук с частотой рейза выше 75%."}
};

// Page 7, top RFI row. Every number is the open-raise frequency printed in the source chart.
var chartRows={
 EP:[
  "100 100 100 100 100 100 100 100 100 100 100 100 100",
  "100 100 100 100 100 100 100 80 0 0 0 0 0",
  "100 100 100 100 100 100 80 0 0 0 0 0 0",
  "100 80 0 100 100 100 80 0 0 0 0 0 0",
  "99 0 0 0 100 100 80 0 0 0 0 0 0",
  "0 0 0 0 0 100 80 0 0 0 0 0 0",
  "0 0 0 0 0 0 100 80 0 0 0 0 0",
  "0 0 0 0 0 0 0 100 100 0 0 0 0",
  "0 0 0 0 0 0 0 0 100 95 0 0 0",
  "0 0 0 0 0 0 0 0 0 100 0 0 0",
  "0 0 0 0 0 0 0 0 0 0 80 0 0",
  "0 0 0 0 0 0 0 0 0 0 0 0 0",
  "0 0 0 0 0 0 0 0 0 0 0 0 0"
 ],
 MP:[
  "100 100 100 100 100 100 100 100 100 100 100 100 100",
  "100 100 100 100 100 100 100 100 100 50 50 50 50",
  "100 100 100 100 100 100 100 0 0 0 0 0 0",
  "100 100 100 100 100 100 100 0 0 0 0 0 0",
  "99 100 100 100 100 100 100 0 0 0 0 0 0",
  "50 0 0 0 0 100 100 0 0 0 0 0 0",
  "50 0 0 0 0 0 100 100 0 0 0 0 0",
  "0 0 0 0 0 0 0 100 100 0 0 0 0",
  "0 0 0 0 0 0 0 0 100 100 0 0 0",
  "0 0 0 0 0 0 0 0 0 100 50 0 0",
  "0 0 0 0 0 0 0 0 0 0 100 0 0",
  "0 0 0 0 0 0 0 0 0 0 0 50 0",
  "0 0 0 0 0 0 0 0 0 0 0 0 50"
 ],
 HJ:[
  "100 100 100 100 100 100 100 100 100 100 100 100 100",
  "100 100 100 100 100 100 100 100 100 100 100 80 80",
  "100 100 100 100 100 100 100 99 0 0 0 0 0",
  "100 100 100 100 100 100 100 80 0 0 0 0 0",
  "100 100 100 100 100 100 100 100 0 0 0 0 0",
  "100 80 0 0 80 100 100 100 0 0 0 0 0",
  "100 0 0 0 0 0 100 100 80 0 0 0 0",
  "80 0 0 0 0 0 0 100 100 0 0 0 0",
  "0 0 0 0 0 0 0 0 100 100 0 0 0",
  "0 0 0 0 0 0 0 0 0 100 98 0 0",
  "0 0 0 0 0 0 0 0 0 0 100 0 0",
  "0 0 0 0 0 0 0 0 0 0 0 100 0",
  "0 0 0 0 0 0 0 0 0 0 0 0 80"
 ],
 CO:[
  "100 100 100 100 100 100 100 100 100 100 100 100 100",
  "100 100 100 100 100 100 100 100 100 100 100 100 100",
  "100 100 100 100 100 100 100 100 100 100 100 80 80",
  "100 100 100 100 100 100 100 100 100 100 80 5 5",
  "100 100 100 100 100 100 100 100 100 5 0 0 0",
  "100 100 100 100 99 100 100 100 100 5 0 0 0",
  "100 80 80 80 80 80 100 100 100 80 0 0 0",
  "100 80 0 0 0 0 5 100 100 100 0 0 0",
  "100 5 0 0 0 0 0 0 100 100 80 0 0",
  "100 0 0 0 0 0 0 0 0 100 100 0 0",
  "100 0 0 0 0 0 0 0 0 0 100 5 0",
  "80 0 0 0 0 0 0 0 0 0 0 100 0",
  "80 0 0 0 0 0 0 0 0 0 0 0 100"
 ],
 BTN:[
  "100 100 100 100 100 100 100 100 100 100 100 100 100",
  "100 100 100 100 100 100 100 100 100 100 100 100 100",
  "100 100 100 100 100 100 100 100 100 100 100 100 100",
  "100 100 100 100 100 100 100 100 100 100 100 100 80",
  "100 100 100 100 100 100 100 100 100 100 100 100 80",
  "100 100 100 100 100 100 100 100 100 100 80 80 80",
  "100 100 100 100 100 100 100 100 100 100 80 80 80",
  "100 100 100 80 80 80 100 100 100 100 100 80 80",
  "100 100 80 50 50 50 50 80 100 100 100 80 80",
  "100 100 50 5 5 5 5 50 50 100 100 100 80",
  "100 80 50 5 5 5 5 5 5 50 100 80 80",
  "100 80 50 5 5 0 0 0 0 0 5 100 80",
  "100 80 50 5 5 0 0 0 0 0 0 0 100"
 ]
};

function handAt(row,col){return row===col?ranks[row]+ranks[row]:row<col?ranks[row]+ranks[col]+"s":ranks[col]+ranks[row]+"o"}
var RANGE_THRESHOLD=75,sourceFrequencies={},frequencies={},opens={},targets={},exactTargets={};
Object.keys(chartRows).forEach(function(position){
 var sourceFrequency={},frequency={},open={};
 chartRows[position].forEach(function(row,rowIndex){
  row.split(" ").forEach(function(value,colIndex){var hand=handAt(rowIndex,colIndex),sourcePct=Number(value),pct=sourcePct>RANGE_THRESHOLD?100:0;sourceFrequency[hand]=sourcePct;frequency[hand]=pct;if(pct===100)open[hand]=true});
 });
 sourceFrequencies[position]=sourceFrequency;frequencies[position]=frequency;opens[position]=open;
});
function comboWeight(hand){return hand.length===2?6:hand.slice(-1)==="s"?4:12}
Object.keys(frequencies).forEach(function(position){
 var combos=Object.keys(frequencies[position]).reduce(function(total,hand){return total+(frequencies[position][hand]===100?comboWeight(hand):0)},0),exact=Math.round(combos/1326*1000)/10,rounded=Math.round(exact);
 exactTargets[position]=exact;targets[position]=rounded;positions[position].pct=rounded;
});

var firstSpot={
 id:"rfi-intro-a9o-ep",
 title:"Первая раздача",
 hand:"A9o",
 question:"A9o в ранней позиции. Что нажмёшь?",
 answer:"Базовая линия — пас. A9o не входит в ранний диапазон открытия.",
 table:{
  seats:[
   {label:"UTG",state:"hero",stackBb:40},
   {label:"LJ",state:"waiting",stackBb:40},
   {label:"HJ",state:"waiting",stackBb:40},
   {label:"CO",state:"waiting",stackBb:40},
   {label:"BTN",state:"waiting",stackBb:40},
   {label:"SB",state:"blind",stackBb:40},
   // The snapshot subtracts the posted big blind. One more BB is already in
   // the middle as the BB ante, so 39 here renders the intended visible 38 BB.
   {label:"BB",state:"blind",stackBb:39}
  ],
  heroPosition:"UTG",
  heroStack:"40 BB",
  effectiveStack:"40 BB",
  // Only the BB ante is in the centre. The shared renderer keeps SB and BB
  // in front of their seats, for a visible total of 2.5 BB without doubling.
  pot:"1 BB",
  anteBb:1,
  heroCards:["As","9d"],
  boardCards:[],
  street:"preflop",
  actionLine:[],
  historyLine:"BB ante 1 BB · ранняя позиция · 6 игроков за спиной",
  toCall:0,
  currentBet:0,
  dealerPosition:"BTN"
 },
 options:[
  {key:"fold",label:"Пас",correct:true,feedback:"За спиной шесть игроков, поэтому A9o здесь пас."},
  {key:"limp",label:"Колл",correct:false,feedback:"В базовой стратегии неоткрытого банка лимпа нет. За спиной шесть игроков, поэтому A9o здесь пас."},
  {key:"raise",label:"Рейз 2 BB",correct:false,feedback:"Эта рука откроется позже, но не из EP. За спиной шесть игроков, поэтому A9o здесь пас."}
 ]
};

var spots=[
 ["EP","A9o",0,"A9o не входит в EP 20%: за спиной ещё шесть игроков."],["EP","66",1,"66 открывается из EP со 100% частотой."],["EP","KQo",1,"KQo входит в чистую раннюю базу."],["EP","QJo",0,"QJo остаётся пасом из EP."],
 ["MP","KTo",1,"KTo открывается из MP со 100% частотой."],["MP","QJo",1,"QJo — чистая добавка средней позиции."],["MP","K9o",0,"K9o ещё не входит в MP 24%."],["HJ","44",1,"44 открывается из HJ со 100% частотой."],
 ["HJ","QTo",1,"QTo входит в чистый опен HJ."],["HJ","K8o",0,"K8o остаётся пасом из HJ."],["CO","A5o",1,"A5o входит в чистый опен CO."],["CO","Q9o",1,"Q9o открывается из CO со 100% частотой."],
 ["CO","Q7o",0,"Q7o остаётся пасом из CO."],["CO","76s",1,"76s входит в чистый опен CO."],["BTN","K5o",1,"K5o открывается на BTN со 100% частотой."],["BTN","92o",0,"92o остаётся пасом даже на BTN."],
 ["BTN","Q7o",1,"Q7o входит в чистый опен BTN."],["BTN","87o",1,"87o открывается на BTN со 100% частотой."],["BTN","72o",0,"Широкий BTN — не любые две карты: 72o остаётся пасом."],["BTN","54s",1,"54s входит в чистый опен BTN."]
].map(function(item,index){return{id:"rfi-"+index,position:item[0],hand:item[1],open:!!item[2],frequency:frequencies[item[0]][item[1]],reason:item[3]}});

window.PokerRfiData=Object.freeze({version:"rfi-open-page7-20260713-v5",physicalPage:7,rangeThreshold:RANGE_THRESHOLD,positions:positions,ranks:ranks,sourceFrequencies:sourceFrequencies,frequencies:frequencies,opens:opens,firstSpot:Object.freeze(firstSpot),spots:spots,targets:targets,exactTargets:exactTargets})
})();
