import Twister from "mersennetwister";

export default class Battler {

  static readonly statsOrder = "str vit def spd".split(" ")
  static readonly statsBase = {str:10, vit:30, def:10, spd:10};

  twister:Twister = new Twister();

  str: number;
  vit: number;
  agi: number;
  def: number;
  spd: number;
  int: number;

  nextAttack: number;
  hp: number;

  constructor(public id:number, stats?:any){
    if(stats){
      Object.assign(this, stats);
    }
  }

  interval(){
    return 10000 / this.spd;
  }

  rni(){
    return this.twister.int()
  }

  seed(n:number){
    this.twister.seed(Math.abs(n)*2 + this.id)
  }

  get isProto(){
    return this.id == -1;
  }
}
