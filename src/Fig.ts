import Game from "./Game";

export default class Fig {
  cells: number[] = [];
  neighbors: Fig[] = [];
  depth: number;
  last: number;
  bottomRow:boolean;
  resolved = false;
  reached = false;

  constructor(public game: Game, public kind: string, public id: number) {}

  addNeighbor(n: Fig) {
    if (n && !this.neighbors.includes(n)) {
      this.neighbors.push(n);
      n.neighbors.push(this);
    }
  }

  reach() {
    if (this.reached) return;
    this.reached = true;
    if (this.kind == "none") {
      this.resolve();
    }
    this.updateAnalysis();
  }

  resolve() {
    if (this.resolved) return;
    this.resolved = true;
    for (let n of this.neighbors) n.reach();
    this.loot();
  }

  get possible() {
    return this.reached && !this.resolved
  }  

  loot() {
  }

  get score(){
    return this.cells.length * (this.dream?100:1)
  }

  get xp(){
    return null;
  }

  get wasted(){
    return !this.resolved && this.game.wasted(this.last)
  }

  get dream(){
    return this.kind == "dream";
  }

  get none(){
    return this.kind == "none";
  }

  get color(){
    return this.game.colors(this.kind)
  }

  reset(){
    this.reached = false;
    this.resolved = false;
  }

  updateAnalysis(){
  }

  get deathText():any{
    return null
  }

}
