<script>
  import {
    saves,
    game,
    debrief,
    stateRef,
    state,
    conf,
    board,
    what,
    settings
  } from "./store.js";
  import Game from "./Game";
  import { createGame } from "./Main";
  import lang from "./lang";
  import What from "./What.svelte";
  import Files from "./Files.svelte";
  import MonstrominoAnalysis from "./MonstrominoAnalysis.svelte";
  import LifeAnalysis from "./LifeAnalysis.svelte";
  import { bigNum, strfmt } from "./Util";

  let paper = [new Audio("paper2.ogg"), new Audio("paper.ogg")];
  let bell = new Audio("bell.ogg");

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

  /*let state = state1;
  stateRef.subscribe(s=>{if(s) {
    state = s;
  }})*/

  let mode;
  $: {
    mode = modes[$game.mode];
  }

  function fg(c) {
    return "fg-" + $game.colors(c);
  }

  function bg(c) {
    return "bg-" + $game.colors(c);
  }

  let chrome = navigator.userAgent.search("Chrome") >= 0;
  let dream = "dream" + (chrome ? " dream-animation" : "");
  let useTransition = chrome ? " transition" : "";

  let custom = {};

  conf.subscribe(v => {
    Object.assign(custom, v);
    delete custom.goal;
  });

  function clickCell(e) {
    if (e.button != 0) return;
    if (e.shiftKey) {
      $game.logFigAt(e.target.id);
    } else {
      let result = $game.attackFigAt(e.target.id);
      if (result) {
        if ($settings.sound) {
          let sound = result.dream
            ? bell
            : paper[Math.floor(Math.random() * 2)];
          sound.playbackRate =
            (1 + Math.random() * 1.3) * (result.dream ? 0.5 : 1);
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

  let analysisPosition = "";

  function updateAnalysisPosition() {
    let [x, y] = mousePosition;
    let width = analysis ? analysis.offsetWidth : 400;
    let s = `left: ${
      x > window.innerWidth - width - 70 ? x - width - 50 : x + 100
    }px; top: ${Math.min(
      y,
      window.innerHeight - (analysis ? analysis.offsetHeight : 50) - 50
    )}px`;
    analysisPosition = s;
  }

  let moveTimeout;

  document.onmousemove = e => {
    mousePosition = [e.x, e.y];
    let movement = Math.abs(e.movementX) + Math.abs(e.movementY);
    showInfo();
    updateAnalysisPosition();

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
    window.scrollTo(0, 0);
    window.location.hash = "#" + new URLSearchParams(conf).toString();
    createGame();
  }

  function playCustom() {
    $game.wipeAuto();
    goTo(custom);
  }

  function toggleWhat() {
    $what = !$what;
  }

  function cellClasses(fig) {
    let classes = [
      fig.dream ? "bg-none" : "bg-" + fig.color,
      fig.resolved && !fig.dream ? "resolved" : "",
      useTransition
    ];

    if (fig.wasted) {
      classes.push("wasted");
    } else {
      classes = classes.concat([
        fig.dream && fig.resolved && chrome ? "dream-animation" : "",
        fig.possibility == 1 ? mode.attackable : "",
        fig.dream || fig.possibility > 0 || (fig.resolved && fig.reached)
          ? ""
          : mode.impossible
      ]);
    }
    classes = classes.filter(s => s != "").join(" ");
    return classes;
  }

  function cellStyle(fig) {
    if (fig.possibility > 0 && fig.possibility < 1) {
      let color = fig.dream ? colors[fig.color].bg : "rgba(0,0,0,0.3)";
      return `box-shadow: inset 0px 0px 0px ${10 -
        8 * fig.possibility}px ${color};`;
    } else {
      return "";
    }
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

  let colors = {
    red: [0xff0000, 0xff0000],
    orange: [0xff8000, 0xff8000],
    yellow: [0xffdd00, 0xffd700],
    green: [0x00bb00, 0x00ee00],
    cyan: [0x00bbbb, 0x00ffff],
    blue: [0x0000ff, 0x3333ff],
    violet: [0xbb00ff, 0xbb00ff],
    dream: [0x00bbbb, 0x00ffff],
    none: [0xffffff, 0xffffff]
  };

  function toStringColor(n) {
    return "#" + ("000000" + n.toString(16)).substr(-6);
  }

  for (let k in colors) {
    colors[k] = {
      fg: toStringColor(colors[k][0]),
      bg: toStringColor(colors[k][1])
    };
  }

  let style = document.createElement("style");
  style.type = "text/css";
  document.getElementsByTagName("head")[0].appendChild(style);
  style.innerHTML = Object.keys(colors)
    .map(
      color => `
    .fg-${color} { color: ${colors[color].fg}}
    .bg-${color} { background: ${colors[color].bg}}
    `
    )
    .join("\n");
</script>

{#if target}
  {#if target.wasted}
    <div
      style={analysisPosition}
      bind:this={analysis}
      class="analysis width-300 {!moveTimeout ? 'analysis-shown' : ''}">
      <div class="detached-title">
        {@html lang.wasted}
      </div>
      <div class="combat-log">
        {@html strfmt(lang.tip_wasted, $game.wastedDelay, $game.turnsPerWastedLine)}
      </div>
    </div>
  {:else if $game.mode == 'monstromino' && target.battle}
    <div
      style={analysisPosition}
      bind:this={analysis}
      class="analysis {!moveTimeout ? 'analysis-shown' : ''}">
      <MonstrominoAnalysis {...{ target, fg, dream }} />
    </div>
  {:else if $game.mode == 'life' && target.stats}
    <div
      style={analysisPosition}
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
    <button class="hotkey" on:click={e => toPage('board')}>back</button>
    <div class="page-title">{page}</div>
  {/if}

  <div class="spacer" />
  <div class="turns">
    {#if page == 'board'}
      <span class="field-name">score</span>
      <span class="{dream} tooltip-bottom" data-tooltip={lang.tip_score}>
        {bigNum($state.score)}
      </span>
      {#if $conf.goal}
        <span class="field-name {dream}">/{$conf.goal}</span>
      {/if}
      <span class="field-name">turns</span>
      <span>{Math.round($state.turns)}</span>
    {/if}
  </div>
</div>

<div class="bottom panel card {$what ? '' : 'panel-hidden-s'}">
  {#if page == 'files'}
    {@html lang.what_files}
  {:else}
    <What {...{ fg, bg, dream }} />
  {/if}
  <div />
  <button on:click={e => ($what = false)}>Ok, got it</button>
</div>

<div
  class="center panel {$state.complete && page == 'board' ? '' : 'panel-hidden'}">

  <div class="detached-title card large-font" style="padding:5px">
    {$state.complete ? ($state.haveMoves ? 'Board clear' : 'You have failed at life') : ''}
  </div>

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
      {#if i > 0}&nbsp;{/if}
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
      <span style="margin:0px 10px">
        Or use the form at the bottom for another board/mode.
      </span>
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
      <div
        class="waste-line"
        style="width:{20 * $conf.width + 100}px;transform:translateY({$state.wasteDepth * 20}px);">
        {Math.floor($state.turnsToWaste)}
        <span class="field-name">turns</span>
      </div>
      <div class="animations">
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
          {fig.dream && !fig.resolved && !fig.wasted ? 'shiny' : ''}"
          style={cellStyle(fig)} />
      {/each}
    </div>
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
      <button on:click={playCustom}>play</button>
    </div>
  {/if}
  {#if page == 'files'}
    <Files />
  {/if}
  {#if page == 'settings'}
    <div class="settings">
      <label>
        <input type="checkbox" bind:checked={$settings.sound} />
        Sound
      </label>
      <label>
        <input type="checkbox" bind:checked={$settings.abridgedAnalysis} />
        Shortened combat analysis
      </label>
    </div>
  {/if}
</div>

<div class="se-corner">
  <button class="important" on:click={toggleWhat}>Help</button>
</div>
