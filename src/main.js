import App from './App.svelte';
import Game from './Game'

window.onload = function(){  

  new Game({width:50, height:100, seed:5}, "auto")

  app = new App({
    target: document.body,
  });

}

export default app;