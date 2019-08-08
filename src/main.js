import App from './App.svelte';
import Game from './Game'

window.onload = function(){    

  let conf = {}
  if(document.location.search){
    let usp = new URLSearchParams(document.location.search.substr(1));
    conf = Object.fromEntries(usp.entries())
  } else {
    conf = {width:50, height:100, seed:5};
  }

  app = new App({
    target: document.body,
    props:{game: new Game(conf, "auto")}
  });

}

export default app;