import Game from "./Game";
import RainbowFig from "./RainbowFig"
import { weightedRandom } from "./Util";

export default class Rainbow extends Game {
  color:number;

  get statsOrder(){
    return ["color"]
  }

  get colorsList() {
    return ["none", "dream", "red", "yellow", "green", "blue", "violet"];
  }
  
  createFig(kind:string, id:number){
    return new RainbowFig(this, kind, id)
  }

  cellGenerator(ind: number) {
    return weightedRandom([1, 0, 1, 1, 1, 1, 1], this.rni);
  }

  stateExtraFields() {
    return {
      color: this.color,
    };
  }    

  init(){
    this.color = 0;
  }

  get dreamFrequency() {
    return 400;
  }

  get turnsPerWastedLine() {
    return 2;
  }

  get wastedDelay() {
    return 10;
  }

}
