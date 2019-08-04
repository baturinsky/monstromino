<script>
  import {
    games,
    game,
    turns,
    cash,
    str,
    vit,
    spd,
    def,
    what,
    updateSaves
  } from "./store.js";
  import Game from "./Game";
  import lang from "./lang";
  import Battler from "./Battler";

  let enemy;
  let analysis;
  let page = "board";

  let conf = Object.assign({}, $game.conf);

  function clickCell(e) {    
    if (e.shiftKey) $game.logBeastAt(e.target.id);
    else $game.attackBeastAt(e.target.id);
  }

  function hoverCell(e) {
    let i = e.target.id;
    if($game.cutoff(i)){
      enemy = null;
      return;
    }
    let beast = $game.beastAt(i);
    if (!beast || beast.dead) {
      enemy = null;
    } else {
      beast.updateBattler();
      enemy = beast;
    }
  }

  function unHoverCell(e) {
    enemy = null;
  }

  let moveTimeout;

  function moveAnalysis(x, y) {
    if (analysis) {
      x = x > window.innerWidth - 380 ? x - 350 : x + 100;
      y = Math.min(y, window.innerHeight - analysis.offsetHeight - 50);

      analysis.style.left = x + "px";
      analysis.style.top = y + "px";
    }
  }

  document.onmousemove = e => {
    let movement = Math.abs(e.movementX) + Math.abs(e.movementY);
    if (movement < 9) moveAnalysis(e.x, e.y);
    else {
      if (moveTimeout) clearTimeout(moveTimeout);
      moveTimeout = setTimeout(_ => {
        moveAnalysis(e.x, e.y);
        moveTimeout = null;
      }, 1);
    }
  };

  function undo() {
    $game.undo();
  }

  function reset() {
    $game.reset();
  }

  let bigNumLetters = " K M B t q Q s S o n d U D T Qt Qd Sd St O N v c".split(
    " "
  );

  console.log(bigNumLetters.join(" "));

  function bigNum(n) {
    let i;
    for (i = 0; Math.abs(n) > 10000 && i < bigNumLetters.length; i++) n /= 1000;
    return Math.round(n) + bigNumLetters[i];
  }

  function open(p) {
    enemy = null;
    page = p;
    if (p == "files") updateSaves();
  }

  function playFromConf() {
    for (let k in conf) conf[k] = +conf[k];
    $game.config(conf);
    $game.generate();
    $game.play();
  }

  function toggleWhat() {
    $what = !$what;
  }

  function deleteSave(id) {
    console.log("del", id);
    $game.remove(id);
    updateSaves();
  }

  function loadSave(id) {
    console.log("load", id);
    $game.load(id);
    open("board");
  }

  function newSave(id) {
    $game.save(id);
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
      case "KeyW":
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
    class="analysis {enemy && enemy.battle && !moveTimeout ? 'shown' : ''}"
    bind:this={analysis}>

    <div class="enemy">
      {#each Battler.statsOrder as field, i}
        {@html i == 0 ? '' : '&nbsp;'}
        <span class="fg-{field}">{bigNum(enemy.battler[field])}</span>
      {/each}
    </div>

    <div class="combat-log">
      {#each enemy.battle.log as move}
        <span class={move.a.isProto ? 'attacking' : 'defending'}>
          {#if move.damage > 0}{bigNum(move.hp)}{:else}={/if}
        </span>
        <span />
      {/each}
    </div>

    <div class="battle-{enemy.battle.outcome} battle-outcome">
      {#if enemy.battle.outcome == 'win'}
        <span class="fg-{enemy.xp[0]}">{bigNum(enemy.xp[1])}</span>
        {enemy.cash}
      {:else}{enemy.battle.outcome.toUpperCase()}{/if}
    </div>

  </div>
{/if}

<div class="header">
  <div class="menu">
    <button>menu</button>
    <div class="dropdown">
      <button on:click={toggleWhat}>What</button>
      <button on:click={e => open('board')}>Board</button>
      <button class="wip">Campaign</button>
      <button on:click={e => open('files')}>Files</button>
    </div>
  </div>
  <div class="spacer" />
  {#if page == 'board'}
    <button class="hotkey" on:click={undo}>undo</button>
    <div class="prota">
      <span class="field-name">str</span>
      <span class="fg-str">{bigNum($str)}</span>
      &nbsp;
      <span class="field-name">vit</span>
      <span class="fg-vit">{bigNum($vit)}</span>
      &nbsp;
      <span class="field-name">def</span>
      <span class="fg-def">{bigNum($def)}</span>
      &nbsp;
      <span class="field-name">spd</span>
      <span class="fg-spd">{bigNum($spd)}</span>
    </div>
    <button class="hotkey wip">ability</button>
  {:else}
    <div class="page-title">{page}</div>
  {/if}

  <div class="spacer" />
  <div class="turns">
    {#if page == 'board'}
      <span class="field-name">turns</span>
      <span>{$turns}</span>
      <span class="field-name">$</span>
      <span>{Math.round($cash)}</span>
    {/if}
  </div>
</div>

{#if $what}
  <div class="what">
    {@html { board: lang.what, files: lang.what_files }[page]}
    <div />
    <button on:click={e => ($what = false)}>Ok, got it</button>
  </div>
{/if}

<div class="main">
  {#if page == 'board'}
    <div
      class="board-table"
      style="width:{20 * $game.width}px"
      on:mousemove={hoverCell}
      on:mousedown={clickCell}
      on:mouseleave={unHoverCell}>
      {#each $game.board as beast, i}
        <div
          id={i}
          class="cell bg-{beast.kind}
          {beast.dead ? 'dead' : ''}
          {$game.cutoff(i) ? 'cutoff' : [beast.attackable && beast == enemy ? 'aimed' : '', beast.attackable ? 'attackable' : '', beast.winnable || (beast.dead && beast.reached) ? 'lightup' : ''].join(' ')}
          " />
      {/each}
    </div>
    <div class="board-conf">
      Seed
      <input bind:value={conf.seed} />
      &nbsp;Width
      <input bind:value={conf.width} />
      &nbsp;Height
      <input bind:value={conf.height} />
      &nbsp;
      <button on:click={playFromConf}>play</button>
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
              <button on:click={e => deleteSave(save[0])}>X</button>
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
