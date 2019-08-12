import Game from "./Game";
import { weightedRandom } from "./Util";
import Fig from "./Fig";

class LifeState {
  self: number;
  friends: number;
  family: number;
  career: number;

  power(kind?: string) {
    return (
      Object.values(this).reduce((a, b) => a + b) + (kind ? this[kind] * 2 : 0)
    );
  }
}

const statsBase={
  self: 10,
  friends: 10,
  family: 10,
  career: 10
}

class LifeFig extends Fig {
  state: LifeState;

  reset() {
    super.reset();
    this.state = new LifeState();
  }

  loot() {
    if(!(this.kind in this.state))
      return;
    this.game.score += this.score - 3;
    this.life.prota[this.kind] += Math.floor(
      this.state[this.kind] / 10
    );
  }

  get life() {
    return this.game as Life;
  }

  get possible() {
    
    if (!this.reached || this.resolved) return false;

    if(!this.state)
      this.updateAnalysis();

    if (this.dream) {
      return Object.keys(this.state).every(k => {
        return this.state[k] <= this.life.prota[k]
      });
    } else {
      let thisPower = this.state.power(this.kind);
      let protaPower = this.life.prota.power(this.kind);
      return protaPower >= thisPower;
    }
  }

  get outcome(){
    return this.possible?"possible":"impossible";
  }

  updateAnalysis() {

    if (this.resolved || this.kind == "none") {
      return this;
    }

    let ownMultiplier = 4;
    let neighborMultiplier = 2;
    let dreamMultiplier = 3;
    let baseBonus = 5;
    let finalMultiplier = 0.015;
    let depthScaling = 0.035

    let bonuses = { self: 0, friends: 0, family: 0, career: 0, dream: 0 };

    bonuses[this.kind] = this.cells.length * ownMultiplier;

    for (let n of this.neighbors) {
      if (!n.resolved) {
        bonuses[n.kind] += n.cells.length * neighborMultiplier;
      }
    }

    for (let stat of this.life.statsOrder) {
      bonuses[stat] += bonuses.dream * dreamMultiplier;
    }

    bonuses.dream = 0;

    for (let stat in statsBase) {
      this.state[stat] = Math.floor(
        statsBase[stat] *
          (baseBonus + bonuses[stat]) *
          Math.pow(10, 1 + this.depth * depthScaling) *
          finalMultiplier
      );
    }  
  }
}

const colorsConst = {
  self: "red",
  friends: "yellow",
  family: "green",
  career: "blue",
  none: "none",
  dream: "dream"
};

export default class Life extends Game {
  prota: LifeState;

  get statsOrder() {
    return ["self", "friends", "family", "career"];
  }

  get colorsList() {
    return ["none", "dream", "self", "friends", "family", "career"];
  }

  colors(kind: string) {
    return colorsConst[kind];
  }

  createFig(kind: string, id: number) {
    return new LifeFig(this, kind, id);
  }

  cellGenerator(ind: number) {
    return weightedRandom([1, 0, 1, 1, 1, 1], this.rni);
  }

  init() {
    this.prota = new LifeState();
    Object.assign(this.prota, {
      self: 30,
      friends: 30,
      family: 30,
      career: 30
    });
  }

  stateExtraFields() {
    return this.prota;
  }

  get dreamFrequency() {
    return 400;
  }
}
