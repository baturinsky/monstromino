export function compareObjects(a, b){
  for(let k in a){
    if(a[k] != b[k])
      return false;
  }
  return true;
}


export function weightedRandom(a: number[], rni: () => number) {
  let roll = (rni() % a.reduce((x, y) => x + y)) - a[0];
  let i = 0;
  while (roll >= 0) roll -= a[++i];
  return i;
}

export let bigNumLetters = " K M B t q Q s S o n d U D T Qt Qd Sd St O N v c".split(
  " "
);

export function bigNum(n) {
  if(isNaN(+n))
    return n;
  let i;
  for (i = 0; Math.abs(n) > 10000 && i < bigNumLetters.length; i++) n /= 1000;
  return Math.round(n) + bigNumLetters[i];
}


export function strfmt(fmt:string, ...args) {
  return fmt.replace(/{(\d+)}/g, function(match, number) { 
    return typeof args[number] != 'undefined'
      ? args[number] 
      : match
    ;
  });
};