<script>
  import { game } from "./store";
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
        <span style="margin:15px" class="shiny" />
        dreams.
      </td>
    </tr>

    <tr>
      <td>Method</td>
      <td>
        You can collect a dream or any other figure by clicking it. But only if
        you have a path to it and can defeat it in combat.
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
      <td>Stats</td>
      <td>
        Enemy stats depend on their depth, size, color and neighbors. You gain
        stats by defeating enemies. Mouse over your stats and score at the top
        for details of what each of them do.
      </td>
    </tr>
  {/if}
  {#if $game.mode == 'rainbow'}
    <tr>
      <td>Objective</td>
      <td>
        Collect all
        <span style="margin:15px" class="shiny" />
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

</table>
