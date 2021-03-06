import Game from "./Game";
import Battler from "./Battler";
import { weightedRandom } from "./Util";
import MonstrominoFig from "./MonstrominoFig";

const colorsConst = {
  str: "red",
  vit: "green",
  def: "yellow",
  spd: "blue",
  none: "none",
  dream: "dream"
};

export default class Monstromino extends Game {
  prota: Battler;

  get statsOrder(){
    return ["str", "vit", "def", "spd"]
  }

  get colorsList() {
    return ["none", "dream", "str", "vit", "def", "spd"];
  }

  colors(kind:string) {
    return colorsConst[kind];
  }
  
  createFig(kind:string, id:number){
    return new MonstrominoFig(this, kind, id)
  }

  cellGenerator(ind: number) {
    return weightedRandom([1, 0, 1, 1, 1, 1], this.rni);
  }

  init(){
    this.prota = new Battler().stats({
      str: 40,
      vit: 40,
      def: 40,
      spd: 40
    });
  }

  stateExtraFields() {
    return {str:this.prota.str, vit:this.prota.vit, def:this.prota.def, spd:this.prota.spd};
  }    

  get dreamFrequency() {
    return 400;
  }

}
