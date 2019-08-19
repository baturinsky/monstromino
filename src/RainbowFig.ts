import Fig from "./Fig";
import Rainbow from "./Rainbow";

export default class MonstrominoFig extends Fig {
  
  loot() {
    let colorN = this.rainbow.colorsList.indexOf(this.kind);
    if(colorN>1){
      colorN = colorN + 1
      if(colorN >= this.rainbow.colorsList.length)
        colorN = 2;
    }
    this.rainbow.color = colorN;

    this.game.score += this.score - 3;
  }

  get rainbow(){
    return this.game as Rainbow;
  }

  get possibility() {
    return (
      this.reached &&
      !this.resolved &&
      (this.rainbow.color<=1 || this.kind == "dream" || this.rainbow.colorsList.indexOf(this.kind) == this.rainbow.color)
    )?1:0;
  }
}
