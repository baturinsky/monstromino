import App from "./App.svelte";
import { createGame } from "./Main";

window.onload = function() {
  createGame();

  new App({
    target: document.body
  });
};
