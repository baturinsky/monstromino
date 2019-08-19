<script>
  import { game } from "./store";
  export let bg;
  export let fg;
  export let dream;
</script>

<style>
  td:first-child {
    margin: 10px;
    font-weight: bold;
    vertical-align: top;
  }
</style>

<table class="what">

  {#if $game.mode == 'monstromino'}
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
        You can collect a dream or any other figure by clicking it. But only if
        you have a path to it and can defeat a beast guarding it in combat.
      </td>
    </tr>
    <tr>
      <td>Stats</td>
      <td>
        Enemy stats depend on their depth, size, color and neighbors. You gain
        stats by defeating enemies. Mouse over your stats and score at the top
        for details of what each of them do.
      </td>
    </tr>
    <tr>
      <td>Combat</td>
      <td>
        Combat is automatic and you know how it will go beforehand. It's
        calculated based on yours and enemy's stats. Combat is a draw if it's
        not over after 20 attacks.
      </td>
    </tr>
    <tr>
      <td>Legend</td>
      <td>      
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)}"> </span>
        {/each} - You can defeat it.
        <br/>
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)}" style="box-shadow: inset 0px 0px 0px 4px rgba(0,0,0,0.3)"> </span>
        {/each} - you are too weak for it. Thickness of border is how bad combat with it would go.<br/>
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)} darken"> </span>
        {/each} - you have not reached it yet.<br/>
        <span class="shiny-inline" /> - dream. Gives no stats, but a lot of score.
      </td>
    </tr>

  {/if}
  {#if $game.mode == 'rainbow'}
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
        Colors of figure you can collect are rotated in rainbow order (red&gt;yellow&gt;green&gt;blue&gt;violet).
        <span style="dream">Dream</span> can follow any color and be followed by any color.
      </td>
    </tr>
  {/if}
  {#if $game.mode == 'life'}
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
        Each colored figure represents some life situation and is relevant to one of life aspects - 
        <span class={fg("self")}>self</span>,
        <span class={fg("friends")}>friends</span>,
        <span class={fg("family")}>family</span> or
        <span class={fg("career")}>career</span>. Click on it to resolve it and improve relative stat and also open the way to figures behind it.
      </td>
    </tr>
    <tr>
      <td>Resolution</td>
      <td>
        Whether situation is resolvable is dependent on your stats.
        If the sum of your relevant (i.e. same colored) stat and average of all other stats is more or equal than situation difficulty, then it's resolvable.        
        Dreams work a bit different - they have separate requirements for all stats and all must be met.
      </td>
    </tr>
    <tr>
      <td>Legend</td>
      <td>      
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)}"> </span>
        {/each} - resolvable situations.
        <br/>
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)}" style="box-shadow: inset 0px 0px 0px 4px rgba(0,0,0,0.3)"> </span>
        {/each} - unresolvable. Thickness of border is how much your stats are insufficient.<br/>
        {#each $game.statsOrder as stat}
          <span class="cell {bg(stat)} darken"> </span>
        {/each} - unreachable.<br/>
        <span class="shiny-inline" /> - dream. 
        If it has a colored border <span class="shiny-inline" style="box-shadow: inset 0px 0px 0px 4px rgba(0,0,255, 1)" /> then
        you are missing that stat (the most).
      </td>
    </tr>

  {/if}

</table>

