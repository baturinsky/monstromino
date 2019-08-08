export function compareObjects(a, b){
  for(let k in a){
    if(a[k] != b[k])
      return false;
  }
  return true;
}
