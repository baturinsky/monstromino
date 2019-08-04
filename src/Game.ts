import * as store from "./store";
import Twister from "mersennetwister";
import { Beast } from "./Beast";
import Battler from "./Battler";

function weightedRandom(a:number[], rni: () => number){
  let roll = rni() % a.reduce((x,y) => x + y) - a[0];
  let i = 0;
  while(roll >= 0)
    roll -= a[++i]
  return i;
}

class Config{
  width:number;
  height:number;
  seed:number;
}

export default class Game {
  twister = new Twister();

  rni: () => number;
  board: Beast[] = [];
  beasts: Beast[] = [];
  deltas: number[];

  prota: Battler;
  turns: number[];

  cash: number;
  conf: Config;
  public persist:string = null

  persistIn(path:string){
    this.persist = path;
    return this;
  }

  constructor(conf?:Config, persist?:string) {
    if(conf)
      this.conf = conf;
    if(persist)
      this.loadOrGenerate(persist);
    store.game.set(this)
  }

  loadOrGenerate(path:string){
    this.persist = path;
    if(!this.load(path)){
      this.generate();
      this.play();
    }
    return this;
  }

  config(c:Config){
    this.conf = c;
    return this;
  }

  load(path:string):boolean{
    if(!path)
      return;
    let data = localStorage.getItem(path);
    if (data && data != "undefined") {
      this.deserialize(JSON.parse(data));
      return true
    }
    return false
  }

  save(path?:string){
    if(!path){
      path = store.nextSlot()
    }
    console.log("saving to", path);
    localStorage.setItem(path, JSON.stringify(this.serialized()));
  }

  remove(path:string){
    localStorage.removeItem(path)
  } 


  get savedFields() {
    return "conf turns cash".split(" ");
  }

  serialized() {
    let data = {date: new Date()};
    for (let field of this.savedFields) data[field] = this[field];
    return data;
  }

  get cellsNumber() {
    return this.width * this.height;
  }

  get width(){
    return this.conf.width
  }

  get height(){
    return this.conf.height
  }

  deserialize(data: any) {
    console.log(data);
    for (let field in data) this[field] = data[field];
    this.generate();
    this.play(data.turns);
  }

  generate() {
    this.turns = []
    this.beasts = []
    this.twister.seed(this.conf.seed);    
    this.rni = this.twister.int.bind(this.twister);
    this.deltas = [-1, 1, -this.width, +this.width];

    let raw = [...Array(this.cellsNumber)].map(a => weightedRandom([1,1,1,1,1], this.rni));
    this.board = raw.map(_ => null);
    for (let i in raw) {
      this.populate(raw, Number(i));
    }    
  }

  populate(raw: number[], start: number) {
    if (this.board[start]) return;

    let color = raw[start];
    let kind = ["str", "vit", "def", "spd", "none"][color];
    let heap = [start];

    let beast = new Beast(this, kind, this.beasts.length);
    this.beasts.push(beast);

    while (heap.length > 0) {
      let cur = heap.pop();
      this.board[cur] = beast;
      beast.cells.push(cur);
      for (let delta of this.deltas) {
        let next = cur + delta;
        if (
          Math.abs(delta) == 1 &&
          Math.floor(cur / this.width) != Math.floor(next / this.width)
        )
          continue;
        if (this.board[next]) {
          beast.addNeighbor(this.board[next]);
        } else if (raw[next] == color) {
          heap.push(next);
        }
      }
    }

    for (let b of this.beasts) {
      let depths = b.cells.map(cell => Math.floor(cell / this.width));
      b.depth = Math.round(depths.reduce((a, b) => a + b) / b.cells.length);
    }
  }

  play(turns: number[] = []) {
    this.turns = turns;
    this.cash = 0;

    this.prota = new Battler(-1, {
      str: 20,
      vit: 50,
      agi: 10,
      def: 10,
      spd: 30,
      int: 10
    });

    for (let beast of this.beasts) {
      beast.reached = false;
      beast.dead = false;
      beast.battle = null;
    }

    for (let i = 0; i < this.width; i++) {
      this.board[i].reach();
    }

    for (let id of turns) {
      if(this.beasts[id])
        this.beasts[id].die();
    }

    this.updateStore();
  }

  attackBeastAt(cell: number) {
    if(this.cutoff(cell))
      return;
    let beast = this.board[cell];
    if (!beast) return;
    if (beast.winnable) {
      beast.die();
      this.turns.push(beast.id);
      this.updateStore();
      this.save(this.persist)
    }
  }

  updateBattles() {
    for (let b of this.beasts) {
      if (b.reached && !b.dead) {
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
    return this.beasts[id];
  }

  beastAt(cell: number) {
    return this.board[cell];
  }


  updateStore() {
    this.updateBattles();
    store.game.set(this);
    store.turns.set(this.turns.length);
    store.cash.set(this.cash, null);
    store.str.set(this.prota.str, null);
    store.vit.set(this.prota.vit, null);
    store.def.set(this.prota.def, null);
    store.spd.set(this.prota.spd, null);
  }

  cutoff(i:number){
    return i < this.width * Math.floor(this.turns.length / 3 - 5);
  }

}
