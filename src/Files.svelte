<script>
  import { saves, game, updateSaves, log } from "./store.js";
  import lang from "./lang";

  updateSaves();

  function deleteSave(id) {
    log(`Deleted ${id}`);
    $game.erase(id);
    updateSaves();
  }

  function loadSave(id) {
    log(`Loaded from ${id}`);
    $game.load(id);
    goTo($game.conf);
  }

  function newSave(id) {
    id = $game.save(id);
    updateSaves();
    log(`Saved as ${id}`);
  }

  window.onkeydown = e => {
    switch (e.code) {
      case "KeyQ":
        newSave();
        return;
    }
  };
</script>

<div class="files">
  <table>
    {#each [...$saves].sort((a, b) =>
      Number(a[0].substr(5)) < Number(b[0].substr(5)) ? -1 : 1
    ) as save}
      <tr>
        <td>
          {#if save[0] != 'auto' && save[1] != '#NEW'}
            <button
              on:click={e => deleteSave(save[0])}
              class="tooltip-bottom savex"
              data-tooltip={lang.tip_erase}>
              X
            </button>
          {:else}
            <span>{save[0] == 'auto' ? 'AUTO' : ''}</span>
          {/if}
        </td>
        <td>
          <button
            on:click={e => (save[1] == '#NEW' ? newSave(save[0]) : loadSave(save[0]))}
            class="save">
            {save[1] == '#NEW' ? 'Save in a new slot' : save[1]}
          </button>
        </td>
      </tr>
    {/each}
  </table>
</div>
