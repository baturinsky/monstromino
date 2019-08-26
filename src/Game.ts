import * as store from "./store";
import Twister from "mersennetwister";
import Fig from "./Fig";

class Game {
  twister = new Twister();

  rni: () => number;
  board: Fig[] = [];
  figs: Fig[] = [];
  deltas: number[];
  dreamsResolved: number;
  dreamsWasted: number;
  dreamsTotal: number;
  complete: boolean;
  haveMoves: boolean;

  turns: number[] = [];

  score: number;
  conf: Game.Config;
  public persist: string = null;

  constructor(conf?: Game.Config, persist?: string) {
    if (persist) this.persist = persist;
    this.config(conf);
    store.game.set(this);
  }

  colors(kind: string) {
    return kind;
  }

  start() {
    this.generate();
    this.play();
    this.saveAuto();
  }

  config(c: Game.Config) {
    this.conf = c;
    return this;
  }

  load(src: string | any): boolean {
    try {
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
    } catch {
      console.log("corrupted save")
      this.wipeAuto();
      location.reload();
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
    return path;
  }

  erase(path: string) {
    localStorage.removeItem(path);
  }

  get savedFields() {
    return "conf turns".split(" ");
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
    for (let field in data) this[field] = data[field];
    this.generate();
    this.play(data.turns);
  }

  get dreamFrequency() {
    return 400;
  }

  cellGenerator(ind: number) {
    return 0;
  }
  get colorsList() {
    return ["none"];
  }

  generate() {
    this.turns = [];
    this.figs = [];
    this.twister.seed(this.conf.seed);
    this.rni = this.twister.int.bind(this.twister);
    this.deltas = [-1, 1, -this.width, +this.width];

    let raw = [...Array(this.cellsNumber)].map((a, i) => this.cellGenerator(i));

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

  createFig(kind: string, id: number) {
    return new Fig(this, kind, id);
  }

  populate(raw: number[], start: number) {
    if (this.board[start]) return;

    let color = raw[start];
    let kind = this.colorsList[color];
    let heap = [start];

    let fig = this.createFig(kind, this.figs.length);
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

  init() {}

  play(turns: number[] = []) {
    this.init();

    this.turns = turns;
    this.score = 0;
    this.dreamsTotal = 0;
    this.haveMoves = true;

    for (let fig of this.figs) {
      fig.reset();
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
    if (fig.wasted) return null;
    if (!fig) return null;
    if (fig.possible) {
      fig.resolve();
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

  wipeAuto() {
    localStorage.removeItem(this.persist);
  }

  updateResolutions() {
    this.haveMoves = false;
    for (let f of this.figs) {
      if (f.reached && !f.resolved) {
        if (f.possible) {
          this.haveMoves = true;
        }
        f.updateAnalysis();
      }
    }
  }

  undo() {
    if (this.turns.length > 0) {
      this.play(this.turns.slice(0, -1));
    }
  }

  reset() {
    this.play();
  }

  logFigAt(cell: number) {
    let fig = this.board[cell];
    fig.updateAnalysis();
    console.log(fig);
  }

  fig(id: number) {
    return this.figs[id];
  }

  figAt(cell: number) {
    return this.board[cell];
  }

  stateExtraFields() {
    return {};
  }

  stateChanged() {
    this.updateResolutions();

    this.dreamsResolved = 0;
    this.dreamsWasted = 0;
    for (let f of this.figs) {
      if (f.dream) {
        if (f.resolved) this.dreamsResolved++;
        else if (f.wasted) this.dreamsWasted++;
      }
    }

    store.conf.set(this.conf);
    store.board.set(this.board);

    this.complete =
      this.dreamsResolved + this.dreamsWasted == this.dreamsTotal ||
      !this.haveMoves;

    let state = {
      turns: this.turns.length,
      score: this.score,
      wasteDepth: this.wasteDepth,
      turnsToWaste: this.turnsToWaste,
      complete: this.complete ? 1 : 0,
      haveMoves: this.haveMoves ? 1 : 0
    };

    Object.assign(state, this.stateExtraFields());

    store.setGameState(state);

    store.debrief.set(this.debrief);
  }

  get wasteDepth() {
    return Math.max(
      0,
      Math.floor(
        (this.turns.length - this.wastedDelay) / this.turnsPerWastedLine
      )
    );
  }

  get turnsToWaste() {
    let delayed = this.turns.length - this.wastedDelay;
    if (delayed < 0) return -delayed;
    return this.turnsPerWastedLine - (delayed % this.turnsPerWastedLine);
  }

  wasted(i: number) {
    return i < this.width * this.wasteDepth;
  }

  get turnsPerWastedLine() {
    return 3;
  }

  get wastedDelay() {
    return 20;
  }

  get debrief() {
    let d = {
      score: this.score,
      dreamsResolved: this.dreamsResolved,
      dreamsWasted: this.dreamsWasted,
      turns: this.turns.length,
      challengeUrl: this.challengeUrl
    };
    for (let f of this.figs) {
      if (f.resolved) d[f.kind] = (d[f.kind] || 0) + f.cells.length;
    }
    return d;
  }

  get challengeUrl() {
    let urlConf: any = {};
    Object.assign(urlConf, this.conf);
    urlConf.goal = this.score;
    let params = new URLSearchParams(urlConf);
    let url =
      window.location.host + window.location.pathname + "#" + params.toString();
    return url;
  }

  colorAt(cell) {
    return this.figAt(cell).color;
  }

  get statsOrder() {
    return [];
  }

  get mode() {
    return this.conf.mode;
  }
}

module Game {
  export class Config {
    mode: string;
    width: number;
    height: number;
    seed: number;
    goal: number;
  }
}

export default Game;
