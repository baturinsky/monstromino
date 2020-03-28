<script>
  export let custom;
  export let playCustom;
  export let command = "play";
</script>

<div class="board-conf">
  Mode
  <select bind:value={custom.mode}>
    {#each ['monstromino', 'rainbow', 'life'] as question}
      <option value={question}>{question}</option>
    {/each}
  </select>
  Seed
  <input bind:value={custom.seed} />
  &nbsp;Width
  <input bind:value={custom.width} />
  &nbsp;Height
  <input bind:value={custom.height} />
  &nbsp;
  <button class="explicit" on:click={playCustom}>{command}</button>
</div>
