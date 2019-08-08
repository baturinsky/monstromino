import Battler from "./Battler";
import Game from "./Game";
import Battle from "./Battle";

export default class Figure {
  cells: number[] = [];
  neighbors: Figure[] = [];
  depth: number;
  last: number;
  bottomRow:boolean;
  resolved = false;
  reached = false;
  battler: Battler;
  battle: Battle;

  constructor(public game: Game, public kind: string, public id: number) {}

  addNeighbor(n: Figure) {
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
  }

  resolve() {
    if(this.resolved)
      return;
    if(!this.battler)
      this.updateBattler();
    this.resolved = true;
    for (let n of this.neighbors) n.reach();    
    this.loot()
  }

  updateBattler() {
    if (this.resolved || this.kind == "none") {
      this.battler = null;
      return this;
    }

    let bonuses = {};
    
    for (let stat in Battler.statsBase)
      bonuses[stat] = 0;

    bonuses[this.kind] = this.cells.length * 4;

    for (let n of this.neighbors) {
      if (!n.resolved) {
        bonuses[n.kind] += n.cells.length;
      }
    }

    if (!this.battler) this.battler = new Battler(this);

    for (let stat in Battler.statsBase) {
      this.battler[stat] = Math.floor(
        (Battler.statsBase[stat] *
          (10 + bonuses[stat] * 2) *
          Math.pow(10, 1 + this.depth/20)) /
          100
      );
    }

    this.battle = new Battle([this.game.prota, this.battler]);

    return this;
  }

  get possible() {
    return this.reached && !this.resolved && this.battle && this.battle.outcome == "win";
  }

  loot() {
    let statName = this.kind;
    if(statName == "none")
      return;
    this.game.prota[statName] += Math.floor(this.battler[statName] / 10);
    this.game.score += this.score;
  }

  get score(){
    return this.cells.length * (this.dream?100:1)
  }

  get xp(){
    let statName = this.kind;
    return [statName, Math.floor(this.battler[statName] / 10)];
  }

  get frozen(){
    return this.game.frozen(this.last)
  }

  get dream(){
    return this.kind == "dream";
  }

}
