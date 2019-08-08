<script>
  import {
    games,
    debrief,
    state,
    conf,
    board,
    what,
    abridgedAnalysis,
    updateSaves
  } from "./store.js";
  import Game from "./Game";
  import lang from "./lang";
  import Battler from "./Battler";

  let enemy;
  let page = "board";
  let hovered;
  let mousePosition = [0, 0];
  export let game;

  let colors = game.colors;
  let fg = {};
  let bg = {};
  for (let c in colors) {
    fg[c] = "fg-" + colors[c];
    bg[c] = "bg-" + colors[c];
  }

  let custom = {};
  const statsOrder = "str vit def spd".split(" ");

  conf.subscribe(v => Object.assign(custom, v));

  function clickCell(e) {
    if (e.button != 0) return;
    if (e.shiftKey) game.logBeastAt(e.target.id);
    else game.attackBeastAt(e.target.id);
  }

  function hoverCell(e) {
    hovered = e.target.id;
  }

  function showInfo() {
    let beast = game.beastAt(hovered);
    hovered = null;
    if (!beast) {
      enemy = null;
      return;
    }
    if (!beast || beast.resolved) {
      enemy = null;
    } else {
      beast.updateBattler();
      enemy = beast;
    }
  }

  function unHoverCell(e) {
    hovered = enemy = null;
  }

  function moveAnalysis(x, y) {
    showInfo();
  }

  let analysis;
  function analysisPosition() {
    let [x, y] = mousePosition;
    let width = analysis ? analysis.offsetWidth : 400;
    let s = `left: ${
      x > window.innerWidth - width - 50 ? x - width - 50 : x + 100
    }px; top: ${Math.min(
      y,
      window.innerHeight - (analysis ? analysis.offsetHeight : 50) - 50
    )}px`;
    return s;
  }

  let moveTimeout;

  document.onmousemove = e => {
    mousePosition = [e.x, e.y];
    let movement = Math.abs(e.movementX) + Math.abs(e.movementY);
    showInfo();

    if (movement > 4) {
      if (moveTimeout) clearTimeout(moveTimeout);
      moveTimeout = setTimeout(_ => {
        moveTimeout = null;
      }, 1000);
    }
  };

  function undo() {
    game.undo();
  }

  function reset() {
    game.reset();
  }

  let bigNumLetters = " K M B t q Q s S o n d U D T Qt Qd Sd St O N v c".split(
    " "
  );

  function bigNum(n) {
    let i;
    for (i = 0; Math.abs(n) > 10000 && i < bigNumLetters.length; i++) n /= 1000;
    return Math.round(n) + bigNumLetters[i];
  }

  function customize() {}

  function open(p) {
    hovered = enemy = null;
    page = p;
    if (p == "files") updateSaves();
  }

  function goTo(params) {
    window.location.search = "?" + new URLSearchParams(params).toString();
  }

  function playCustom() {
    for (let k in custom) custom[k] = +custom[k];
    game.start(custom);
    goTo(custom);
  }

  function toggleWhat() {
    $what = !$what;
  }

  function deleteSave(id) {
    console.log("del", id);
    game.erase(id);
    updateSaves();
  }

  function loadSave(id) {
    console.log("load", id);
    game.load(id);
    open("board");
  }

  function newSave(id) {
    game.save(id);
    updateSaves();
    console.log("new", id);
  }

  window.onkeydown = e => {
    switch (e.code) {
      case "KeyS":
        newSave();
        return;
      case "KeyF":
        if (page == "files") open("board");
        else open("files");
        return;
      case "KeyB":
        open("board");
        return;
      case "KeyH":
        toggleWhat();
        return;
      case "KeyU":
        undo();
        return;
    }
  };
</script>

{#if enemy && enemy.battle && enemy.battler}
  <div
    style={analysisPosition()}
    bind:this={analysis}
    class="analysis {!moveTimeout ? 'analysis-shown' : ''}">

    {#if enemy.frozen}
      <div class="enemy">
        {@html lang.FROZEN}
      </div>
      <div class="combat-log">
        {@html lang.tip_frozen}
      </div>
    {:else}
      <div class="enemy">
        {#each Battler.statsOrder as field, i}
          {@html i == 0 ? '' : '&nbsp;'}
          <span class="field-name">{$abridgedAnalysis ? '' : field}</span>
          <span class={fg[field]}>{bigNum(enemy.battler[field])}</span>
        {/each}
      </div>

      <div class="combat-log">
        {#each enemy.battle.log as move}
          {#if $abridgedAnalysis}
            <span class={move.a.isProto ? 'attacking' : 'defending'}>
              {#if move.damage > 0}{bigNum(move.hp)}{:else}={/if}
            </span>
          {:else}
            <div class="complete-log">
              <nobr>
                <span class={move.a.isProto ? 'attacking' : 'defending'}>
                  {move.a.isProto ? 'Made' : 'Took'}
                </span>
                <span class={fg.str}>{bigNum(move.damageRoll)}</span>
                -
                <span class={fg.def}>{bigNum(move.def)}</span>
                {#if move.damage <= 0}
                  =
                  <span class={fg.def}>no damage</span>
                {:else}
                  =
                  <span class={fg.str}>{bigNum(move.damage)}</span>
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

      <div class="battle-outcome">
        {#if enemy.battle.outcome != 'win' || !$abridgedAnalysis}
          <span class="battle-{enemy.battle.outcome}">
            {enemy.battle.outcome.toUpperCase()}
          </span>
        {/if}
        {#if enemy.battle.outcome == 'win'}
          {$abridgedAnalysis ? '' : enemy.xp[0]}
          <span class={fg[enemy.xp[0]]}>
            {($abridgedAnalysis ? '' : '+') + bigNum(enemy.xp[1])}
          </span>
          score
          <span class="rainbow">+ {enemy.score}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<div class="header">
  <div class="menu">
    <button>menu</button>
    <div class="dropdown">
      <button on:click={toggleWhat}>Help</button>
      <button on:click={e => open('board')}>Board</button>
      <button on:click={e => open('files')}>Files</button>
    </div>
  </div>
  <div class="spacer" />
  {#if page == 'board'}
    <button class="hotkey" on:click={undo}>undo</button>
    <div class="prota">
      {#each statsOrder as stat, i}
        {@html i > 0 ? '&nbsp' : ''}

        <span class="field-name">{stat}</span>
        <span
          class="{fg[stat]} tooltip-bottom"
          data-tooltip={lang['tip_' + stat]}>
          {bigNum($state[stat])}
        </span>
      {/each}
    </div>
    <button class="hotkey wip tooltip-bottom" data-tooltip={lang.tip_ability}>
      ability
    </button>
  {:else}
    <div class="page-title">{page}</div>
  {/if}

  <div class="spacer" />
  <div class="turns">
    {#if page == 'board'}
      <span class="field-name">score</span>
      <span class="rainbow tooltip-bottom" data-tooltip={lang.tip_score}>
        {bigNum($state.score)}
      </span>
      <span class="field-name">turns</span>
      <span>{Math.round($state.turns)}</span>
    {/if}
  </div>
</div>

<div class="bottom panel {$what ? '' : 'panel-hidden-ne'}">
  {@html { board: lang.what, files: lang.what_files }[page]}
  <div />
  <button on:click={e => ($what = false)}>Ok, got it</button>
</div>

<div class="center panel {$state.complete && page=="board" ? '' : 'panel-hidden-n'}">
  <div>
    <h4>Board clear</h4>
    <big>
      Score:
      <span class="rainbow">{$debrief.score}</span>
    </big>
    =
    <br />
    <br />
    {$debrief.dreamsResolved}
    <span class="rainbow">&nbsp;dream</span> cells
    * 100
    {#each statsOrder as field}
      + {bigNum($debrief[field])}
      <span class={fg[field]}>{field}</span>
      cells&nbsp;
    {/each}
    - {$debrief.turns} turns * 3
  </div>
  <br />
  <small>
    Challenge url - you can share it with someone who wants to try and beat your
    record on this board:
    <br />
    <br />
  </small>
  <u>
    <a href={$debrief.challengeUrl}>{$debrief.challengeUrl}</a>
    <br />
    <br />
    <div class="buttons-horizontal">
      <button on:click={undo}>Undo</button>
      <button on:click={customize}>Edit board</button>
    </div>
  </u>
</div>

<div class="main">
  {#if page == 'board'}
    <div
      class="board-table"
      style="width:{20 * $conf.width}px"
      on:mousemove={hoverCell}
      on:mousedown={clickCell}
      on:mouseleave={unHoverCell}>
      {#each $board as beast, i}
        <div
          id={i}
          class="cell {beast.dream && !beast.resolved ? 'bg-none' : bg[beast.kind]}
          {beast.resolved && !beast.dream ? 'resolved' : ''}
          {beast.frozen && !beast.dream ? 'frozen' : [beast.possible && beast == enemy ? 'aimed' : '', beast.possible ? 'attackable' : '', beast.dream || beast.possible || (beast.resolved && beast.reached) ? '' : 'darken'].join(' ')}
          ">
          {#if beast.dream && !beast.resolved && !beast.frozen}
            <div class="dream" />
          {/if}
        </div>
      {/each}
    </div>
    <div class="board-conf">
      Seed
      <input bind:value={custom.seed} />
      &nbsp;Width
      <input bind:value={custom.width} />
      &nbsp;Height
      <input bind:value={custom.height} />
      &nbsp;
      <button on:click={playCustom}>play</button>
    </div>
  {/if}
  {#if page == 'files'}
    <div class="files">
      <ul>
        {#each [...$games].sort((a, b) =>
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
  {/if}
</div>
