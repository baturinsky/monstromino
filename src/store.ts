import { writable } from "svelte/store";
import { tweened } from "svelte/motion";
import Battler from "./Battler";
import Game from "./Game";

let tween = {
  duration: 100,
  easing: t => t
};

export const log = writable("");
export const enemy = writable(null as Battler);
export const turns = writable(0);
export const game = writable(null as Game);
export const what = writable(true);

what.set(localStorage.what == "no" ? false : true);
what.subscribe(v => localStorage.setItem("what", v ? "yes" : "no"));

export const cash = tweened(0, tween);

export const str = tweened(0, tween);
export const vit = tweened(0, tween);
export const def = tweened(0, tween);
export const spd = tweened(0, tween);

export const games = writable([] as string[][]);

let savePrefix = "game ";
let savePrefixLength = savePrefix.length;

export function updateSaves() {
  let list = [];
  let nextInd = 0;

  for (let k in localStorage) {
    if (k == "auto" || k.substr(0, savePrefixLength) == savePrefix) {
      let data: { conf: any; date: Date; turns: number[] } = JSON.parse(
        localStorage[k]
      );
      let n = Number(k.substr(savePrefixLength));
      if (n >= nextInd) {
        nextInd = n + 1;
      }
      let description = "?";
      try {
        description = `t${data.turns.length} ${data.conf.width}x${
          data.conf.height
        } #${data.conf.seed} ${data.date.toLocaleString()}`;
      } catch (e) {
        console.error(e);
      }
      if (k == "auto") list.unshift([k, description]);
      else list.push([k, description]);
    }
  }
  list.push(["game " + nextInd, "#NEW"]);
  games.set(list);
}

export function nextSlot() {
  let nextInd = 0;
  for (let k in localStorage) {
    if (k.substr(0, savePrefixLength) == savePrefix) {
      let n = Number(k.substr(savePrefixLength));
      if (n >= nextInd) {
        nextInd = n + 1;
      }
    }
  }

  return savePrefix + nextInd;
}

//updateSaves()
