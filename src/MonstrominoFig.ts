import Fig from "./Fig";
import Battle from "./Battle";
import Monstromino from "./Monstromino";
import Battler from "./Battler";

export default class MonstrominoFig extends Fig {
  battle: Battle;

  get battler() {
    return this.battle ? this.battle.enemy : null;
  }

  get monstromino() {
    return this.game as Monstromino;
  }

  loot() {
    this.game.score += this.score - this.scorePerTurn;

    let statName = this.kind;
    if (statName == "none") return;
    this.monstromino.prota[statName] += Math.floor(
      this.battle.enemy[statName] * this.lootRatio
    );
  }

  get xp() {
    if(this.kind == "dream")
      return null;
    let statName = this.kind;
    return [statName, Math.floor(this.battle.enemy[statName] / 10)];
  }

  /*resolve() {
    if (this.resolved) return;
    if (!this.battle) this.updateAnalysis();
    this.resolved = true;
    for (let n of this.neighbors) n.reach();
    this.loot();
  }*/

  updateAnalysis() {
    if (this.resolved || this.kind == "none") {
      this.battle = null;
      return this;
    }

    let ownMultiplier = 4;
    let neighborMultiplier = 2;
    let dreamMultiplier = 2;
    let baseBonus = 5;
    let finalMultiplier = 0.015;
    let depthScaling = 0.05

    let bonuses = { str: 0, vit: 0, def: 0, spd: 0, dream: 0 };

    bonuses[this.kind] = this.cells.length * ownMultiplier;

    for (let n of this.neighbors) {
      if (!n.resolved) {
        bonuses[n.kind] += n.cells.length * neighborMultiplier;
      }
    }

    let battler = new Battler(this);

    for (let stat of this.game.statsOrder) {
      bonuses[stat] += bonuses.dream * dreamMultiplier;
    }

    bonuses.dream = 0;

    for (let stat in Battler.statsBase) {
      battler[stat] = Math.floor(
        Battler.statsBase[stat] *
          (baseBonus + bonuses[stat]) *
          Math.pow(10, 1 + this.depth * depthScaling) *
          finalMultiplier
      );
    }

    this.battle = new Battle([this.monstromino.prota, battler]);

    return this;
  }

  reset() {
    super.reset();
    this.battle = null;
  }

  get possibility() {
    if (!this.reached || this.resolved || this.wasted) return 0;
    return this.battle?this.battle.success:0;
  }
}
