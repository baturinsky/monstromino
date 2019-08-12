<script>
  import {
    settings
  } from "./store.js";
  import { bigNum } from "./Util"

  export let target;
  export let fg;
  export let dream;

  let abridgedAnalysis;
  $: abridgedAnalysis = $settings.abridgedAnalysis;

</script>

<div class="detached-title">
  {#each target.game.statsOrder as field, i}
    {@html i == 0 ? '' : '&nbsp;'}
    <span class="field-name">{abridgedAnalysis ? '' : field}</span>
    <span class={fg(field)}>{bigNum(target.state[field])}</span>
  {/each}
</div>

<div class="battle-outcome">
  {#if target.outcome != 'possible' || !abridgedAnalysis}
    <span class="battle-{target.outcome}">
      {target.outcome.toUpperCase()}
    </span>
  {/if}
  {#if target.outcome == 'possible'}
    {#if target.xp}
    {abridgedAnalysis ? '' : target.xp[0]}
    <span class={fg(target.xp[0])}>
      {(abridgedAnalysis ? '' : '+') + bigNum(target.xp[1])}
    </span>
    {/if}
    {abridgedAnalysis ? '' : 'score'}
    <span class={dream}>+ {target.score}</span>
  {/if}
</div>

<div class="combat-log">

</div>

