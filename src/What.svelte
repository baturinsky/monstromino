<script>
  import { game } from "./store";
  export let bg;
  export let fg;
  export let dream;
  export let whatPage;

$:{
console.log(whatPage)
}  
</script>

<style>
  td:first-child {
    margin: 10px;
    font-weight: bold;
    vertical-align: top;
  }
</style>

{#if whatPage == 'files'}
<div style="text-align:center">
  <div>Here you can save in a new slot, load any save or delete them (with X).</div>
  <div>After each your move game is saved to the AUTO slot.</div>
  <div>At any moment, you can quick save to a new slot with "Q" button.</div>
</div>
{/if}

<table class="what">
  {#if whatPage != 'files'}
  <tr>
  <td colspan="2" style="text-align:center; font-weight: normal;">
      <b>{whatPage}</b> mode
    </td>
  </tr>
  {/if}
    
  {#if whatPage == 'monstromino'}
    <tr>
      <td>Objective</td>
      <td>
        Collect all
        <span class="shiny-inline" />
        dreams.
      </td>
    </tr>

    <tr>
      <td>Method</td>
      <td>
        Each colored figure is a monster. Mouse over it to see it's stats and
        how would combat go if you attack it. Click to attack. If you win, you
        will gain some of victim's stats, score, and gain access to monsters
        behind it.
      </td>
    </tr>
    <tr>
      <td>Tips</td>
      <td>
        Figure's stats depend on their depth, size, color and neighbors.
        <br />
        Mouse over your stats and score at the top for details of what each of
        them do.
        <br />
        Combat is a draw if it's not over after 20 attacks
      </td>
    </tr>
    <tr>
      <td>Legend</td>
      <td>
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)}" />
        {/each}
        - You can defeat it.
        <br />
        {#each $game.statsOrder as stat}
          <span
            class="cell {bg(stat)}"
            style="box-shadow: inset 0px 0px 0px 4px rgba(0,0,0,0.3)" />
        {/each}
        - you are too weak for it. Thickness of border is how bad combat with it
        would go.
        <br />
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)} darken" />
        {/each}
        - you have not reached it yet.
        <br />
        <span class="shiny-inline" />
        - dream. Gives no stats, but a lot of score.
      </td>
    </tr>
  {/if}
  {#if whatPage == 'rainbow'}
    <tr>
      <td>Objective</td>
      <td>
        Collect all
        <span class="shiny-inline" />
        dreams.
      </td>
    </tr>
    <tr>
      <td>Method</td>
      <td>
        Colors of figure you can collect are rotated in rainbow order
        (red&gt;yellow&gt;green&gt;blue&gt;violet).
        <span style="dream">Dream</span>
        can follow any color and be followed by any color.
      </td>
    </tr>
  {/if}
  {#if whatPage == 'life'}
    <tr>
      <td>Objective</td>
      <td>
        Reach your
        <span class="shiny-inline" />
        dreams and get maximum score.
      </td>
    </tr>

    <tr>
      <td>Method</td>
      <td>
        Each colored figure represents some life situation and is relevant to
        one of life aspects -
        <span class={fg('self')}>self</span>
        ,
        <span class={fg('friends')}>friends</span>
        ,
        <span class={fg('family')}>family</span>
        or
        <span class={fg('career')}>career</span>
        . Click on it to resolve it and improve relative stat and also open the
        way to figures behind it.
      </td>
    </tr>
    <tr>
      <td>Resolution</td>
      <td>
        Whether situation is resolvable is dependent on your stats. If the sum
        of your relevant (i.e. same colored) stat and average of all other stats
        is more or equal than situation difficulty, then it's resolvable. Dreams
        work a bit different - they have separate requirements for all stats and
        all must be met.
      </td>
    </tr>
    <tr>
      <td>Legend</td>
      <td>
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)}" />
        {/each}
        - resolvable situations.
        <br />
        {#each $game.statsOrder as stat}
          <span
            class="cell {bg(stat)}"
            style="box-shadow: inset 0px 0px 0px 4px rgba(0,0,0,0.3)" />
        {/each}
        - unresolvable. Thickness of border is how much your stats are
        insufficient.
        <br />
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)} darken" />
        {/each}
        - unreachable.
        <br />
        <span class="shiny-inline" />
        - dream. If it has a colored border
        <span
          class="shiny-inline"
          style="box-shadow: inset 0px 0px 0px 4px rgba(0,0,255, 1)" />
        then you are missing that stat (the most).
      </td>
    </tr>
  {/if}

</table>
