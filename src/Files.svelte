<script>
  import {
    saves,
    game,
    updateSaves
  } from "./store.js";
  import lang from "./lang";

  updateSaves();

  function deleteSave(id) {
    console.log("del", id);
    $game.erase(id);
    updateSaves();
  }

  function loadSave(id) {
    console.log("load", id);
    $game.load(id);
    goTo($game.conf);
  }

  function newSave(id) {
    $game.save(id);
    updateSaves();
    console.log("new", id);
  }
  window.onkeydown = e => {
    switch (e.code) {
      case "KeyQ":
        newSave();
        return;
    }
  }

</script>

<div class="files">
  <ul>
    {#each [...$saves].sort((a, b) =>
      Number(a[0].substr(5)) < Number(b[0].substr(5)) ? -1 : 1
    ) as save}
      <li>
        {#if save[0] != 'auto' && save[1] != '#NEW'}
          <button
            on:click={e => deleteSave(save[0])}
            class="tooltip-bottom"
            data-tooltip={lang.tip_erase}>
            X
          </button>
        {:else}
          <span>{save[0] == 'auto' ? 'AUTO' : ''}</span>
        {/if}
        <button
          on:click={e => (save[1] == '#NEW' ? newSave(save[0]) : loadSave(save[0]))}
          class="save">
          {save[1] == '#NEW' ? 'Save in a new slot' : save[1]}
        </button>
      </li>
    {/each}
  </ul>
</div>
