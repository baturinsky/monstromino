import App from './App.svelte';
import Game from './Game'

window.onload = function(){    

app = new App({
    target: document.body,
    props:{game: Game.create()}
  });

}

export default app;