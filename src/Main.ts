import Game from "./Game";
import Monstromino from "./Monstromino";
import Rainbow from "./Rainbow";
import { compareObjects } from "./Util";
import Life from "./Life";

export function createGame() {
  let urlConf;

  let defaultConf = { width: 30, height: 80, seed: 1, mode:"life" };
  if (document.location.hash) {
    let usp = new URLSearchParams(document.location.hash.substr(1));
    urlConf = Object.fromEntries(usp.entries());
  }

  let auto = "auto";
  let raw = Game.loadRaw(auto);
  let game:Game;

  if (!raw) {
    game = createGameLike(urlConf || defaultConf, auto);
    game.start();
    return game;
  }

  let confMatches = !urlConf || compareObjects(raw.conf, urlConf);

  game = createGameLike(urlConf || raw.conf, auto);

  if (confMatches) {
    game.load(raw);
  } else {
    game.start();
  }

  console.log(game);

  return game;
}

function createGameLike(conf:any, auto:string){
  let game:Game
  switch(conf.mode){
    case "rainbow":
      return new Rainbow(conf, auto);
    case "life":
      return new Life(conf, auto);
    default:
      conf.mode = "monstromino";
      return new Monstromino(conf, auto);
  }
}