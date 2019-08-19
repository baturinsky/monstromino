<script>
  import {
    settings,
    game
  } from "./store.js";
  import { bigNum } from "./Util"

  export let target;
  export let fg;
  export let dream;

  let abridgedAnalysis;
  $: abridgedAnalysis = $settings.abridgedAnalysis;

</script>

<div class="detached-title">
  {#each $game.statsOrder as field, i}
    {@html i == 0 ? '' : '&nbsp;'}
    <span class="field-name">{abridgedAnalysis ? '' : field}</span>
    <span class={fg(field)}>{bigNum(target.battler[field])}</span>
  {/each}
</div>

<div class="battle-outcome">
  {#if target.battle.outcome != 'win' || !abridgedAnalysis}
    <span class="battle-{target.battle.outcome}">
      {target.battle.outcome.toUpperCase()}
    </span>
  {/if}
  {#if target.battle.outcome == 'win'}
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
  {#each target.battle.log as move}
    {#if abridgedAnalysis}
      <span class={move.a.isProto ? 'attacking' : 'defending'}>
        {#if move.damage > 0}{bigNum(move.hp)}{:else}={/if}
      </span>
    {:else}
      <div class="complete-log">
        <nobr>
          <span class={move.a.isProto ? 'attacking' : 'defending'}>
            {move.a.isProto ? 'Made' : 'Took'}
          </span>
          <span class={fg('str')}>{bigNum(move.damageRoll)}</span>
          -
          <span class={fg('def')}>{bigNum(move.def)}</span>
          {#if move.damage <= 0}
            =
            <span class={fg('def')}>no damage</span>
          {:else}
            =
            <span class={fg('str')}>{bigNum(move.damage)}</span>
            dmg,
            <span class={move.a.isProto ? 'attacking' : 'defending'}>
              {bigNum(move.hp)}
            </span>
            hp left
          {/if}
        </nobr>
      </div>
    {/if}
    <span />
  {/each}
</div>

