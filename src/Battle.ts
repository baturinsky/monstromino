import Battler from "./Battler";

export default class Battle {
  time = 0;
  log = [];
  hp = [];
  outcome: string;

  constructor(public bats: Battler[]) {
    for (let b of bats) {
      b.hp = b.vit;
      b.nextAttack = b.interval();
    }

    bats[0].seed(bats[1]);
    bats[1].seed(bats[0]);

    let i = 30;
    while (!this.over() && i-- > 0) {
      let next = Math.min(...bats.map(a => a.nextAttack));
      this.time = next;
      for (let a of bats) {
        if (a.nextAttack <= this.time && !(a.hp <= 0)) {
          let d = bats[0] == a ? bats[1] : bats[0];
          this.log.push(this.attack(a, d));
        }
      }
    }

    this.hp = this.bats.map(b => b.hp);

    if (bats[0].hp <= 0) this.outcome = "lose";
    else if (bats[1].hp <= 0) this.outcome = "win";
    else this.outcome = "draw";
  }

  attack(a: Battler, d: Battler) {
    a.nextAttack = this.time + a.interval();
    let damage = 0;
    let damageRoll =
      a.str <= 1e6 ? a.rni() % (a.str * 2) : (a.rni() % 2e6) * a.str / 1e6;
    damage = Math.max(0, damageRoll - d.def);
    if (damage > 0) d.hp -= damage;
    return { a, d, damage, damageRoll, def:d.def, hp:d.hp };
  }

  over() {
    return this.log.length >= 20 || !this.bats.every(b => b.hp > 0);
  }
}
