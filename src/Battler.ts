import Twister from "mersennetwister";
import Fig from "./Fig";
import Battle from "./Battle";

export default class Battler {

  static readonly statsOrder = "str vit def spd".split(" ")
  static readonly statsBase = {str:10, vit:30, def:10, spd:10, dream:0};

  battle: Battle;

  twister:Twister = new Twister();

  str: number;
  vit: number;
  def: number;
  spd: number;

  nextAttack: number;
  hp: number;


  constructor(public fig?:Fig){
  }

  stats(stats:any){
    Object.assign(this, stats);
    return this;
  }

  interval(){
    return 10000 / this.spd;
  }

  rni(){
    return this.twister.int()
  }

  seed(opponent:Battler){
    let seed = 100 + Math.abs(opponent.fig?opponent.fig.id:-1)*2 + (this.fig?this.fig.id:-1);
    this.twister.seed(seed)
  }

  get isProto(){
    return !this.fig;
  }

  update() {
    let bonuses = {};
    
    for (let stat in Battler.statsBase)
      bonuses[stat] = 0;

    bonuses[this.fig.kind] = this.fig.cells.length * 4;

    for (let n of this.fig.neighbors) {
      if (!n.resolved) {
        bonuses[n.kind] += n.cells.length;
      }
    }    

    for (let stat in Battler.statsBase) {
      this[stat] = Math.floor(
        (Battler.statsBase[stat] *
          (10 + bonuses[stat] * 2) *
          Math.pow(10, 1 + this.fig.depth/20)) /
          100
      );
    }

    this.battle = new Battle([this.fig.game.prota, this]);

    return this;
  }

  attack(d: Battler, battle:Battle) {
    this.nextAttack = battle.time + this.interval();
    let damage = 0;
    let rnd = this.rni();
    let damageRoll = Math.floor((rnd % 2e6) * this.str / 1e6);
    damage = Math.max(0, damageRoll - d.def);
    if (damage > 0) d.hp -= damage;
    return { a:this, d, damage, damageRoll, def:d.def, hp:d.hp };
  }



}
