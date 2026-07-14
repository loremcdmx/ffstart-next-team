(function(root){"use strict";
var STATES=["fold","open"];
	function frequencyState(value){return Number(value||0)>75?"open":"fold"}
	function nextState(value){var index=STATES.indexOf(value);return STATES[(index+1+STATES.length)%STATES.length]}
	function reviewState(chosen,expected){chosen=chosen==="open"?"open":"fold";expected=expected==="open"?"open":"fold";if(chosen==="open")return expected==="open"?"hit":"false-open";return expected==="open"?"missed-open":"correct-fold"}
	function combinationCount(hand){return String(hand||"").length===2?6:String(hand||"").slice(-1)==="s"?4:12}
	function gradeDraft(draft,frequencies){
	 var hands=Object.keys(frequencies),errors=[],missedOpen=[],falseOpen=[],totalCombos=0,wrongCombos=0,missedOpenCombos=0,falseOpenCombos=0;
	 hands.forEach(function(hand){
	  var expected=frequencyState(frequencies[hand]),chosen=draft[hand]||"fold",comboCount=combinationCount(hand);totalCombos+=comboCount;
	  if(chosen===expected)return;
	  var error={hand:hand,chosen:chosen,expected:expected,comboCount:comboCount};errors.push(error);wrongCombos+=comboCount;
	  if(chosen==="fold"){missedOpen.push(error);missedOpenCombos+=comboCount}
	  else{falseOpen.push(error);falseOpenCombos+=comboCount}
	 });
	 return{total:hands.length,correct:hands.length-errors.length,totalCells:hands.length,correctCells:hands.length-errors.length,totalCombos:totalCombos,correctCombos:totalCombos-wrongCombos,wrongCombos:wrongCombos,missedOpenCombos:missedOpenCombos,falseOpenCombos:falseOpenCombos,errors:errors,missedOpen:missedOpen,falseOpen:falseOpen};
	}
	root.PokerRfiRecall=Object.freeze({states:STATES.slice(),frequencyState:frequencyState,nextState:nextState,reviewState:reviewState,combinationCount:combinationCount,gradeDraft:gradeDraft});
})(typeof window!=="undefined"?window:globalThis);
