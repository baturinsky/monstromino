import * as store from "./store";
import Twister from "mersennetwister";
import Figure from "./Figure";
import Battler from "./Battler";
import { compareObjects } from "./Util"

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

export default class Game {
  twister = new Twister();

  rni: () => number;
  board: Figure[] = [];
  figures: Figure[] = [];
  deltas: number[];
  dreamsResolved: number;
  dreamsFrozen: number;
  dreamsTotal: number;
  complete: boolean;

  prota: Battler;
  turns: number[];

  score: number;
  conf: Config;
  public persist: string = null;

  persistIn(path: string) {
    this.persist = path;
    return this;
  }

  get colors(){
    return {
      str: "red",
      vit: "green",
      def: "yellow",
      spd: "blue",
      none: "none",
      dream: "rainbow"
    };
  }

  constructor(conf?: Config, persist?: string) {
    if (conf) this.conf = conf;
    if (persist) this.loadOrGenerate(persist);    
  }

  loadOrGenerate(path: string) {
    this.persist = path;
    let conf = this.conf;
    let loadSuccess = this.load(path)
    if (loadSuccess){
      if(!compareObjects(this.conf, conf)){
        loadSuccess = false;
        this.conf = conf;
      }
    }
  
    if (!loadSuccess) {
      this.generate();
      this.play();
    }

    store.conf.set(this.conf);
    return this;
  }

  config(c: Config) {
    this.conf = c;
    return this;
  }

  load(path: string): boolean {
    if (!path) return;
    let data = localStorage.getItem(path);
    if (data && data != "undefined") {
      this.deserialize(JSON.parse(data));
      return true;
    }
    return false;
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

  generate() {
    this.turns = [];
    this.figures = [];
    this.twister.seed(this.conf.seed);
    this.rni = this.twister.int.bind(this.twister);
    this.deltas = [-1, 1, -this.width, +this.width];

    let raw = [...Array(this.cellsNumber)].map(a =>
      weightedRandom([1, 1, 1, 1, 1], this.rni)
    );

    for (let y = 0; y < this.height; y += 5 + (this.rni() % 5)) {
      let x = this.rni() % this.width;
      raw[y * this.width + x] = 5;
    }

    this.board = raw.map(_ => null);
    for (let i in raw) {
      this.populate(raw, Number(i));
    }

  }

  populate(raw: number[], start: number) {
    if (this.board[start]) return;

    let color = raw[start];
    let kind = ["str", "vit", "def", "spd", "none", "dream"][color];
    let heap = [start];

    let fig = new Figure(this, kind, this.figures.length);
    this.figures.push(fig);

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

    for (let beast of this.figures) {
      beast.reached = false;
      beast.resolved = false;
      beast.battle = null;
      if(beast.dream){
        this.dreamsTotal++;
      }
    }

    for (let i = 0; i < this.width; i++) {
      this.board[i].reach();
    }

    for (let id of turns) {
      if (this.figures[id]) this.figures[id].resolve();
    }

    this.stateChanged();
  }

  attackBeastAt(cell: number) {
    let beast = this.board[cell];
    if (beast.frozen) return;
    if (!beast) return;
    if (beast.possible) {
      beast.resolve();
      this.score -= 3;
      this.turns.push(beast.id);
      this.stateChanged();
      this.saveAuto();
    }
  }

  saveAuto(){
    this.save(this.persist);
  }

  updateBattles() {
    for (let b of this.figures) {
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

  logBeastAt(cell: number) {
    let beast = this.board[cell];
    beast.updateBattler();
    console.log(beast);
  }

  beast(id: number) {
    return this.figures[id];
  }

  beastAt(cell: number) {
    return this.board[cell];
  }

  stateChanged() {
    this.updateBattles();
    store.board.set(this.board);
    this.dreamsResolved = 0
    this.dreamsFrozen = 0
    for(let f of this.figures){
      if(f.dream){
        if(f.resolved)
          this.dreamsResolved++;
        else if(f.frozen)
          this.dreamsFrozen++
      }
    }


    this.complete = this.dreamsResolved + this.dreamsFrozen == this.dreamsTotal
    console.log(this);

    console.log(this);
    store.setGameState({
      turns: this.turns.length,
      score: this.score,
      str: this.prota.str,
      vit: this.prota.vit,
      def: this.prota.def,
      spd: this.prota.spd,
      complete: this.complete?1:0
    })

    store.debrief.set(this.debrief)
  }

  frozen(i: number) {
    return i < this.width * Math.floor(this.turns.length / 3 - 5);
  }

  start(custom:any){
    this.config(custom);
    this.generate();
    this.play();
    this.saveAuto();
  }

  get debrief(){
    let d = {
      score: this.score,
      dreamsResolved: this.dreamsResolved,
      dreamsFrozen: this.dreamsFrozen,
      turns: this.turns.length,
      challengeUrl: this.challengeUrl
    }
    for(let stat of Battler.statsOrder){
      d[stat] = 0;
    }
    for(let f of this.figures){
      if(f.resolved)
        d[f.kind] += f.cells.length;
    }
    return d
  }

  get challengeUrl(){
    let params = new URLSearchParams(this.conf as any);
    params.append("goal", this.score.toString());
    let url = window.location.host + window.location.pathname + "?" + params.toString();
    return url;
  }

}
