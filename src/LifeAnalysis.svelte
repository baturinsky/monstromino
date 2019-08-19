<script>
  import { settings, stateRef, state, game } from "./store.js";
  import { bigNum } from "./Util";

  export let target;
  export let fg;
  export let dream;

  let combatLog;
  let abridgedAnalysis;
  
  /*let state = state1;
  stateRef.subscribe(s=>{if(s) {
    state = s;
  }})*/

  $: abridgedAnalysis = $settings.abridgedAnalysis;

  $: {
    if (target.dream) {
      let all = [];
      for (let stat of $game.statsOrder) {
        let possible = $state[stat] >= target.stats[stat];
        let s = `
        <span class=${fg(stat)}>${bigNum($state[stat])}</span>
        <span class="fg-${possible ? "green" : "red"
        }">${possible ? ">" : "<"}</span>
        <span class=${fg(stat)}>${bigNum(target.stats[stat])}</span>
        `;
        all.push(s);
      }
      combatLog = all.join("<br/>");
    } else {
      let same;
      let other = [];
      for (let stat of $game.statsOrder) {
        let s = `<span class=${bigNum(fg(stat))}>${bigNum($state[stat])}</span>`;
        if (target.kind == stat) same = s;
        else other.push(s);
      }
      combatLog = `
      (${other.join("+")}) / 3 + ${same} = ${bigNum(
        bigNum($game.prota.power(target.kind))
      )}
      <span class="fg-${target.possible ? "green" : "red"}">${
        target.possible ? ">" : "<"
      }</span>
      <span class=${fg(target.kind)}>${bigNum(target.stats[target.kind])}</span>
      `;
    }
  }
</script>

<div class="detached-title">
  {#each target.game.statsOrder as field, i}
    {#if target.stats[field]}
      {@html i == 0 ? '' : '&nbsp;'}
      <span class="field-name">{abridgedAnalysis ? '' : field}</span>
      <span class={fg(field)}>{bigNum(target.stats[field])}</span>
    {/if}
  {/each}
</div>

<div class="battle-outcome">
  {#if target.outcome != 'possible'}
    <span class="battle-{target.outcome}">{target.outcome.toUpperCase()}</span>
  {/if}
  {#if target.outcome == 'possible'}
    {#if target.xp}
      <span class={fg(target.xp[0])}>
        {(abridgedAnalysis ? '' : '+') + bigNum(target.xp[1])}
      </span>
      <span class="field-name">{abridgedAnalysis ? '' : target.xp[0]}</span>
    {/if}
    <span class={dream}>+ {target.score}</span>
    {@html abridgedAnalysis ? '' : `<span class="field-name">score</span>`}
  {/if}
</div>

<div class="combat-log">
  {@html combatLog}
</div>
