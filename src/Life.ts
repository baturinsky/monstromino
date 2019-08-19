import Game from "./Game";
import { weightedRandom } from "./Util";
import Fig from "./Fig";

class LifeState {
  self: number;
  friends: number;
  family: number;
  career: number;

  power(kind?: string): number {
    return (
      (Object.values(this).reduce((a, b) => a + b) +
      (kind ? this[kind] * 2 : 0)) / 3
    );
  }
}

const statsBase = {
  self: 10,
  friends: 10,
  family: 10,
  career: 10
};

class LifeFig extends Fig {
  stats: LifeState;

  reset() {
    super.reset();
    this.stats = new LifeState();
  }

  loot() {
    this.game.score += this.score - this.scorePerTurn;

    if (!(this.kind in this.stats)) return;
    this.life.prota[this.kind] += Math.floor(
      this.stats[this.kind] * this.lootRatio
    );
  }

  get lootRatio() {
    return 0.07;
  }

  get scorePerDream() {
    return 100;
  }

  get life() {
    return this.game as Life;
  }

  get possibility() {
    if (!this.reached || this.resolved || this.wasted) return 0;

    if (!this.stats) this.updateAnalysis();

    let sufficiency = 0;

    if (this.dream) {
      let sufficiencyEach = Object.keys(this.stats).map(k => {
        return this.life.prota[k] / this.stats[k];
      });
      sufficiency = sufficiencyEach.reduce((a, b) => (a < b ? a : b));
    } else {
      let thisPower = this.stats[this.kind];
      let protaPower = this.life.prota.power(this.kind);
      sufficiency = protaPower / thisPower;
    }
    return sufficiency >= 1 ? 1 : sufficiency;
  }

  get outcome() {
    return this.possible ? "possible" : "impossible";
  }

  updateAnalysis() {
    if (this.resolved || this.kind == "none") {
      return this;
    }

    let ownMultiplier = 4;
    let neighborMultiplier = 2;
    let dreamMultiplier = 4;
    let dreamNeighborMultiplier = 2;
    let baseBonus = 5;
    let finalMultiplier = 0.015;
    let depthScaling = 0.03;

    let bonuses = { self: 0, friends: 0, family: 0, career: 0, dream: 0 };

    bonuses[this.kind] = this.cells.length * ownMultiplier;

    for (let n of this.neighbors) {
      if (!n.resolved) {
        bonuses[n.kind] += n.cells.length * neighborMultiplier * (this.dream||n.dream?dreamNeighborMultiplier:1);
      }
    }

    for (let stat of this.life.statsOrder) {
      bonuses[stat] += bonuses.dream * dreamMultiplier;
    }

    bonuses.dream = 0;
    let statsHaving = this.dream ? Object.keys(statsBase) : [this.kind];

    for (let stat of statsHaving) {
      this.stats[stat] = Math.floor(
        statsBase[stat] *
          (baseBonus + bonuses[stat]) *
          Math.pow(10, 1 + this.depth * depthScaling) *
          finalMultiplier
      );
    }
  }

  get xp() {
    if (this.kind == "dream") return null;
    return [this.kind, Math.floor(this.stats[this.kind] * this.lootRatio)];
  }

  get color() {
    if (this.dream) {
      this.updateAnalysis();

      let worstStat = Object.keys(this.stats).reduce(
        ([min, minKey], key) => {
          let ratio = this.life.prota[key] / this.stats[key];
          if (ratio < min) return [ratio, key];
          else return [min, minKey];
        },
        [1, 0]
      );

      if (worstStat[0] >= 1) return this.game.colors("none");
      else return this.game.colors(worstStat[1]);
    }
    return this.game.colors(this.kind);
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
    return 300;
  }
}
