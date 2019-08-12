<script>
  import {
    saves,
    game,
    debrief,
    state,
    conf,
    board,
    what,
    settings
  } from "./store.js";
  import Game from "./Game";
  import lang from "./lang";
  import What from "./What.svelte";
  import Files from "./Files.svelte";
  import MonstrominoAnalysis from "./MonstrominoAnalysis.svelte";
  import LifeAnalysis from "./LifeAnalysis.svelte";
  import { bigNum, strfmt } from "./Util";

  let paper = [new Audio("paper2.ogg"), new Audio("paper.ogg")];

  let target;
  let page = "board";
  let hovered;
  let mousePosition = [0, 0];

  let modes = {
    monstromino: {
      attackable: "attackable",
      impossible: "darken"
    },
    life: {
      attackable: "attackable",
      impossible: "darken"
    },
    rainbow: {
      attackable: "attackable outlined",
      impossible: "somewhat-darken"
    }
  };

  let mode;  
  $: {
    mode = modes[$game.mode];
  }

  /*let colors = $game.colors;
  let fg = {};
  let bg = {};
  for (let c in colors) {
    fg[c] = "fg-" + colors[c];
    bg[c] = "bg-" + colors[c];
  }*/

  function fg(c) {
    return "fg-" + $game.colors(c);
  }

  function bg(c) {
    return "bg-" + $game.colors(c);
  }

  let chrome = navigator.userAgent.search("Chrome") >= 0;
  let dream = "dream" + (chrome ? " dream-animation" : "");

  let custom = {};

  conf.subscribe(v => {
    Object.assign(custom, v);
  });

  function clickCell(e) {
    if (e.button != 0) return;
    if (e.shiftKey) {
      $game.logFigAt(e.target.id);
    } else {
      let result = $game.attackFigAt(e.target.id);
      if (result) {
        if($settings.sound){
          let sound = paper[Math.floor(Math.random()*2)];
          sound.playbackRate = 1 + Math.random() * 1.3;
          sound.volume = 0.5 + Math.random() / 2;
          sound.play();
        }
        animateDeath(result);
      }
    }
  }

  function hoverCell(e) {
    hovered = e.target.id;
  }

  function showInfo() {
    let fig = $game.figAt(hovered);
    hovered = null;
    if (!fig || fig.resolved || fig.none) {
      target = null;
    } else {
      fig.updateAnalysis();
      target = fig;
    }
  }

  function unHoverCell(e) {
    hovered = target = null;
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
    $game.undo();
    particles.length = 0;
  }

  function reset() {
    $game.reset();
  }

  function customize() {}

  function toPage(p) {
    particles.length = 0;
    hovered = target = null;
    page = p;    
  }

  function goTo(conf) {
    window.location.search = "?" + new URLSearchParams(conf).toString();
  }

  function playCustom() {
    /*for (let k in custom) custom[k] = +custom[k];
    $game.start(custom);*/
    /*let c = {};
    Object.assign(c, custom);
    $game.play([]);*/
    $game.wipeAuto()
    goTo(custom);
  }

  function toggleWhat() {
    $what = !$what;
  }

  function cellClasses(fig) {
    let classes = [
      fig.dream && !fig.resolved ? "bg-none" : bg(fig.kind),
      fig.resolved && !fig.dream ? "resolved" : ""
    ];

    if (fig.wasted) {
      classes.push("wasted");
    } else {
      classes = classes.concat([
        fig.dream && fig.resolved && chrome ? "dream-animation" : "",
        fig.possible ? mode.attackable : "",
        fig.dream || fig.possible || (fig.resolved && fig.reached)
          ? ""
          : mode.impossible
      ]);
    }
    classes = classes.filter(s => s != "").join(" ");
    return classes;
  }

  let particles = [];
  let animId = 1;

  function animateDeath(fig) {
    if (!fig) return;
    let text = fig.deathText;
    let tileClass =
      "death " + (text ? bg(text.class) || text.class : bg(fig.kind));

    let added = [];

    for (let cell of fig.cells) {
      added.push({
        style: `left:${(cell % $game.width) * 20}px;top:${Math.floor(
          cell / $game.width
        ) * 20}px;`,
        class: tileClass,
        id: animId++
      });
    }

    if (text) {
      added.push({
        style: `left:${(fig.cells[0] % $game.width) * 20}px;top:${Math.floor(
          fig.cells[0] / $game.width
        ) * 20}px;`,
        class: "flying-text " + (fg(text.class) || text.class),
        content: bigNum(text.text),
        id: animId++
      });
    }

    particles = particles.length > 30 ? added : particles.concat(added);
  }

  function addDeathAnimation(node, anim) {
    let dy = anim.content ? -40 : -70;
    let initialY = anim.content ? -20 : 0;
    let duration = anim.content ? 1500 : 200;

    node.animate(
      [
        {
          opacity: 1,
          display: "block",
          transform: `translate(0px,${initialY}px) rotate3d(1, 0, 0, 0deg)`
        },
        {
          opacity: 0,
          display: "none",
          transform: `translate(${Math.random() * 60 -
            30}px, ${dy}px) rotate3d(${Math.random() * 180 -
            90}, ${Math.random() * 180 - 90}, ${Math.random() * 180 -
            90}, ${Math.random() * 180 - 90}deg)`
        }
      ],
      { duration, easing: "ease-out", fill: "forwards" }
    );
  }

  function animationEnded(anim) {
    let ind = particles.indexOf(anim);

    if (ind >= 0) {
      particles.splice(ind, 1);
    }

    console.log(particles.length);
  }

  window.onkeydown = e => {
    switch (e.code) {
      case "KeyS":
        if (page == "settings") toPage("board");
        else toPage("settings");
        return;
      case "KeyF":
        if (page == "files") toPage("board");
        else toPage("files");
        return;
      case "KeyB":
        toPage("board");
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

{#if target}
  {#if target.wasted}
    <div
      style={analysisPosition()}
      bind:this={analysis}
      class="analysis width-300 {!moveTimeout ? 'analysis-shown' : ''}">
      <div class="detached-title">
        {@html lang.wasted}
      </div>
      <div class="combat-log">
        {@html strfmt(lang.tip_wasted, $game.wastedDelay, $game.turnsPerWastedLine)}
      </div>
    </div>
  {:else if $game.mode == "monstromino" && target.battle}
    <div
      style={analysisPosition()}
      bind:this={analysis}
      class="analysis {!moveTimeout ? 'analysis-shown' : ''}">
      <MonstrominoAnalysis {...{ target, fg, dream }} />
    </div>
  {:else if $game.mode == "life" && target.state}
    <div
      style={analysisPosition()}
      bind:this={analysis}
      class="analysis {!moveTimeout ? 'analysis-shown' : ''}">
      <LifeAnalysis {...{ target, fg, dream }} />
    </div>
  {/if}
{/if}

<div class="header">
  <div class="menu">
    <button>menu</button>
    <div class="dropdown">
      <button on:click={toggleWhat}>Help</button>
      <button on:click={e => toPage('board')}>Board</button>
      <button on:click={e => toPage('files')}>Files</button>
      <button on:click={e => toPage('settings')}>Settings</button>
    </div>
  </div>
  <div class="spacer" />
  {#if page == 'board'}
    <button class="hotkey" on:click={undo}>undo</button>
    <div class="stats">
      {#each $game.statsOrder as stat, i}
        {@html i > 0 ? '&nbsp' : ''}

        <span class="field-name">{stat}</span>
        <span
          class="{fg(stat)} tooltip-bottom"
          data-tooltip={lang['tip_' + stat]}>
          {bigNum($state[stat])}
        </span>
      {/each}
    </div>
    <button class="hotkey wip tooltip-bottom" data-tooltip={lang.tip_ability}>
      ability
    </button>
  {:else}
    <button class="hotkey" on:click={e => toPage("board")}>back</button>
    <div class="page-title">{page}</div>
  {/if}

  <div class="spacer" />
  <div class="turns">
    {#if page == 'board'}
      <span class="field-name">score</span>
      <span class="{dream} tooltip-bottom" data-tooltip={lang.tip_score}>
        {bigNum($state.score)}
      </span>
      <span class="field-name">turns</span>
      <span>{Math.round($state.turns)}</span>
    {/if}
  </div>
</div>

<div class="bottom panel card {$what ? '' : 'panel-hidden-ne'}">
  {#if page == 'files'}
    {@html lang.what_files}
  {:else}
    <What />
  {/if}
  <div />
  <button on:click={e => ($what = false)}>Ok, got it</button>
</div>

<div
  class="center panel {$state.complete && page == 'board' ? '' : 'panel-hidden'}">

  <div class="detached-title card large-font" style="padding:5px">Board clear</div>

  <div class="card wide-lines">
    <big>
      Score:
      <span class={dream}>{$debrief.score}</span>
    </big>
    =
    <br />
    {$debrief.dreamsResolved}
    <span class={dream}>dream</span>
    * 100
    {#each $game.colorsList.slice(2) as field, i}
      {#if i>0}&nbsp;{/if}
      + {bigNum($debrief[field])}
      <span class={fg(field)}>{field}</span>
    {/each}
    - {$debrief.turns} turns * 3
    <br />
    <br />
    <small>
      Challenge url - you can share it with someone who wants to try and beat
      your record on this board:
      <br />
    </small>
    <u>
      <a href={$debrief.challengeUrl}>{$debrief.challengeUrl}</a>
    </u>

    <br />
    <br />
    <div class="buttons-horizontal">
      <button on:click={undo}>Undo</button>
      <button on:click={customize}>Edit board</button>
    </div>
  </div>

</div>

<div class="main">
  {#if page == 'board'}
    <div
      class="board-table"
      style="width:{20 * $conf.width}px"
      on:mousemove={hoverCell}
      on:mousedown={clickCell}
      on:mouseleave={unHoverCell}>
      <div class="particles">
        {#each particles as anim}
          <div
            class={anim.class || 'death'}
            style={anim.style || ''}
            use:addDeathAnimation={anim}>
            {anim.content || ''}
          </div>
        {/each}
      </div>

      {#each $board as fig, i}
        <div
          id={i}
          class="cell {cellClasses(fig)}
          {fig.possible && !fig.wasted && fig == target ? 'aimed' : ''}
          {fig.dream && !fig.resolved && !fig.wasted ? 'shiny' : ''}" />
      {/each}
    </div>
    <div class="board-conf">
      Mode
      <select bind:value={custom.mode}>
        {#each ["monstromino", "rainbow", "life"] as question}
          <option value={question}>
            {question}
          </option>
        {/each}
      </select>    
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
    <Files />
  {/if}
  {#if page == 'settings'}
    <div class="settings">
    <label>
      <input type=checkbox bind:checked={$settings.sound}>
      Sound
    </label>
    <label>
      <input type=checkbox bind:checked={$settings.abridgedAnalysis}>
      Shortened combat analysis
    </label>
    </div>
  {/if}
</div>
