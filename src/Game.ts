import * as store from "./store";
import Twister from "mersennetwister";
import Fig from "./Fig";
import Battler from "./Battler";
import { compareObjects } from "./Util";

function weightedRandom(a: number[], rni: () => number) {
  let roll = (rni() % a.reduce((x, y) => x + y)) - a[0];
  let i = 0;
  while (roll >= 0) roll -= a[++i];
  return i;
}

class Config {
  width: number;
  height: number;
  seed: number;
}

const colorsConst = {
  str: "red",
  vit: "green",
  def: "yellow",
  spd: "blue",
  none: "none",
  dream: "rainbow"
};

export default class Game {
  twister = new Twister();

  rni: () => number;
  board: Fig[] = [];
  figs: Fig[] = [];
  deltas: number[];
  dreamsResolved: number;
  dreamsFrozen: number;
  dreamsTotal: number;
  complete: boolean;

  prota: Battler;
  turns: number[] = [];

  score: number;
  conf: Config;
  public persist: string = null;

  persistIn(path: string) {
    this.persist = path;
    return this;
  }

  get colors() {
    return colorsConst;
  }

  constructor(conf?: Config, persist?: string) {
    if (persist) this.persist = persist;
    this.config(conf);
    store.game.set(this);
  }

  start() {
    this.generate();
    this.play();
    this.saveAuto();
  }

  config(c: Config) {
    this.conf = c;
    return this;
  }

  load(src: string | any): boolean {
    if (typeof src == "string") {
      let data = Game.loadRaw(src);
      if (data) {
        this.deserialize(data);        
        return true;
      }
      return false;
    } else {
      this.deserialize(src);
    }
  }

  static loadRaw(path: string) {
    if (!path) return null;
    let data = localStorage.getItem(path);
    if (data && data != "undefined") {
      return JSON.parse(data);
    } else {
      return null;
    }
  }

  save(path?: string) {
    if (!path) {
      path = store.nextSlot();
    }
    localStorage.setItem(path, JSON.stringify(this.serialized()));
  }

  erase(path: string) {
    localStorage.removeItem(path);
  }

  get savedFields() {
    return "conf turns cash".split(" ");
  }

  serialized() {
    let data = { date: new Date() };
    for (let field of this.savedFields) data[field] = this[field];
    return data;
  }

  get cellsNumber() {
    return this.width * this.height;
  }

  get width() {
    return this.conf.width;
  }

  get height() {
    return this.conf.height;
  }

  deserialize(data: any) {
    console.log(data);
    for (let field in data) this[field] = data[field];
    this.generate();
    this.play(data.turns);
  }

  get dreamFrequency() {
    return 200;
  }

  generate() {
    this.turns = [];
    this.figs = [];
    this.twister.seed(this.conf.seed);
    this.rni = this.twister.int.bind(this.twister);
    this.deltas = [-1, 1, -this.width, +this.width];

    let raw = [...Array(this.cellsNumber)].map(a =>
      weightedRandom([1, 0, 1, 1, 1, 1], this.rni)
    );

    for (
      let i = 0;
      i < this.cellsNumber;
      i +=
        Math.floor(this.dreamFrequency / 2) + (this.rni() % this.dreamFrequency)
    ) {
      if (i == 0) continue;
      raw[i] = 1;
    }

    this.board = raw.map(_ => null);
    for (let i in raw) {
      this.populate(raw, Number(i));
    }
  }

  populate(raw: number[], start: number) {
    if (this.board[start]) return;

    let color = raw[start];
    let kind = ["none", "dream", "str", "vit", "def", "spd"][color];
    let heap = [start];

    let fig = new Fig(this, kind, this.figs.length);
    this.figs.push(fig);

    while (heap.length > 0) {
      let cur = heap.pop();
      this.board[cur] = fig;
      fig.cells.push(cur);
      for (let delta of this.deltas) {
        let next = cur + delta;
        if (
          Math.abs(delta) == 1 &&
          Math.floor(cur / this.width) != Math.floor(next / this.width)
        )
          continue;
        if (this.board[next]) {
          fig.addNeighbor(this.board[next]);
        } else if (raw[next] == color) {
          heap.push(next);
        }
      }
    }

    fig.last = fig.cells.reduce((a, b) => (a > b ? a : b));
    let depths = fig.cells.map(cell => this.row(cell));
    fig.depth = Math.round(depths.reduce((a, b) => a + b) / fig.cells.length);
  }

  row(cell: number) {
    return Math.floor(cell / this.width);
  }

  play(turns: number[] = []) {
    this.turns = turns;
    this.score = 0;
    this.dreamsTotal = 0;

    this.prota = new Battler().stats({
      str: 20,
      vit: 50,
      def: 10,
      spd: 30
    });

    for (let fig of this.figs) {
      fig.reached = false;
      fig.resolved = false;
      fig.battle = null;
      if (fig.dream) {
        this.dreamsTotal++;
      }
    }

    for (let i = 0; i < this.width; i++) {
      this.board[i].reach();
    }

    for (let id of turns) {
      if (this.figs[id]) this.figs[id].resolve();
    }

    this.saveAuto();
    this.stateChanged();
  }

  attackFigAt(cell: number): Fig {
    let fig = this.board[cell];
    if (!fig) return null;
    if (fig.frozen) return null;
    if (!fig) return null;
    if (fig.possible) {
      fig.resolve();
      this.score -= 3;
      this.turns.push(fig.id);
      this.stateChanged();
      this.saveAuto();
      return fig;
    }
    return null;
  }

  saveAuto() {
    this.save(this.persist);
  }

  updateBattles() {
    for (let b of this.figs) {
      if (b.reached && !b.resolved) {
        b.updateBattler();
      }
    }
  }

  undo() {
    if (this.turns.length > 0) this.play(this.turns.slice(0, -1));
  }

  reset() {
    this.play();
  }

  logFigAt(cell: number) {
    let fig = this.board[cell];
    fig.updateBattler();
    console.log(fig);
  }

  fig(id: number) {
    return this.figs[id];
  }

  figAt(cell: number) {
    return this.board[cell];
  }

  stateChanged() {
    this.updateBattles();
    store.conf.set(this.conf);
    store.board.set(this.board);
    this.dreamsResolved = 0;
    this.dreamsFrozen = 0;
    for (let f of this.figs) {
      if (f.dream) {
        if (f.resolved) this.dreamsResolved++;
        else if (f.frozen) this.dreamsFrozen++;
      }
    }

    this.complete = this.dreamsResolved + this.dreamsFrozen == this.dreamsTotal;
    store.setGameState({
      turns: this.turns.length,
      score: this.score,
      str: this.prota.str,
      vit: this.prota.vit,
      def: this.prota.def,
      spd: this.prota.spd,
      complete: this.complete ? 1 : 0
    });

    store.debrief.set(this.debrief);
  }

  frozen(i: number) {
    return i < this.width * Math.floor(this.turns.length / 3 - 5);
  }

  get debrief() {
    let d = {
      score: this.score,
      dreamsResolved: this.dreamsResolved,
      dreamsFrozen: this.dreamsFrozen,
      turns: this.turns.length,
      challengeUrl: this.challengeUrl
    };
    for (let stat of Battler.statsOrder) {
      d[stat] = 0;
    }
    for (let f of this.figs) {
      if (f.resolved) d[f.kind] += f.cells.length;
    }
    return d;
  }

  get challengeUrl() {
    let params = new URLSearchParams(this.conf as any);
    params.append("goal", this.score.toString());
    let url =
      window.location.host + window.location.pathname + "?" + params.toString();
    return url;
  }

  static create() {
    let urlConf;

    let defaultConf = { width: 30, height: 80, seed: 1 };
    if (document.location.search) {
      let usp = new URLSearchParams(document.location.search.substr(1));
      urlConf = Object.fromEntries(usp.entries());
    }

    let auto = "auto";
    let raw = Game.loadRaw(auto);

    if (!raw) {
      let game = new Game(urlConf || defaultConf, auto);
      game.start();
      return game;
    }

    let confMatches = !urlConf || compareObjects(raw.conf, urlConf);

    let game = new Game(urlConf || raw.conf, auto);

    if (confMatches) {
      game.load(raw);
    } else {
      game.start();
    }

    return game;
  }

  colorAt(cell) {
    return this.figAt(cell).color;
  }
}
