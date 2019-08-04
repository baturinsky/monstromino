import Battler from "./Battler";
import Game from "./Game";
import Battle from "./Battle";

export class Beast {
  cells: number[] = [];
  neighbors: Beast[] = [];
  depth: number;
  dead = false;
  reached = false;
  battler: Battler;
  battle: Battle;

  constructor(public game: Game, public kind: string, public id: number) {}

  addNeighbor(n: Beast) {
    if (n && !this.neighbors.includes(n)) {
      this.neighbors.push(n);
      n.neighbors.push(this);
    }
  }

  reach() {
    if (this.reached) return;
    this.reached = true;
    if (this.kind == "none") {
      this.die();
    }
  }

  die() {
    if(this.dead)
      return;
    if(!this.battler)
      this.updateBattler();
    this.dead = true;
    for (let n of this.neighbors) n.reach();    
    this.loot()
  }

  updateBattler() {
    if (this.dead || this.kind == "none") {
      this.battler = null;
      return this;
    }

    let bonuses = {};
    
    for (let stat in Battler.statsBase)
      bonuses[stat] = 0;

    bonuses[this.kind] = this.cells.length * 4;

    for (let n of this.neighbors) {
      if (!n.dead) {
        bonuses[n.kind] += n.cells.length;
      }
    }

    if (!this.battler) this.battler = new Battler(this.id);

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

  get attackable() {
    return this.reached && !this.dead && this.battle && this.battle.outcome == "win";
  }

  get winnable() {
    return this.attackable && this.battle.outcome == "win";
  }

  loot() {
    let statName = this.kind;
    if(statName == "none")
      return;
    this.game.prota[statName] += Math.floor(this.battler[statName] / 10);
    this.game.cash += this.cash;
  }

  get cash(){
    return this.cells.length * (this.depth + 10)
  }

  get xp(){
    let statName = this.kind;
    return [statName, Math.floor(this.battler[statName] / 10)];
  }
}
