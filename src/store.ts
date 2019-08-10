import { writable, derived, Writable, Readable } from "svelte/store";
import { tweened } from "svelte/motion";
import Game from "./Game";

let tween = {
  duration: 100,
  easing: t => t
};

export const conf = writable({});
export const debrief = writable({});
export const board = writable([]);
export const game = writable(null as Game);
export let state:Writable<any>;

export function setGameState(o:any){
  if(!state)
    state = tweened(o, tween) as any
  else
    state.set(o)
}

export const what = writable(true);

what.set(localStorage.what == "no" ? false : true);
what.subscribe(v => localStorage.setItem("what", v ? "yes" : "no"));

export const abridgedAnalysis = writable(false);

export const saves = writable([] as string[][]);

let savePrefix = "game ";
let savePrefixLength = savePrefix.length;

export function updateSaves() {
  let list = [];

  for (let k in localStorage) {
    if (k == "auto" || k.substr(0, savePrefixLength) == savePrefix) {
      let data: { conf: any; date: Date; turns: number[] } = JSON.parse(
        localStorage[k]
      );
      let n = Number(k.substr(savePrefixLength));
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
  list.push([nextSlot(), "#NEW"]);
  saves.set(list);
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