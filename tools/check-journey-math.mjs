import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({Math});
vm.runInContext(readFileSync(new URL('../src/journey.js',import.meta.url),'utf8')+';globalThis.J=Journey;',context);
const J=context.J,a=9.80665,c=299792458;
for(const distance of [1,1e6,3.84e8,1e12,4.07e17]){
  const departure=Math.min(distance*.12,6e7),approach=Math.min(distance*.12,8e7);
  assert.equal(J.progress(0,distance,departure,approach),0);
  assert.equal(J.progress(1,distance,departure,approach),1);
  let previous=0,previousTime=0;
  for(let i=0;i<=10000;i++){
    const s=J.progress(i/10000,distance,departure,approach),t=J.earthElapsed(s,distance,a,c);
    assert.ok(Number.isFinite(t)&&s>=previous-1e-14&&s<=1&&t>=previousTime-1e-5);
    previous=s;previousTime=t;
  }
  for(const seam of [.22,.70])assert.ok(Math.abs(J.progress(seam-1e-8,distance,departure,approach)-J.progress(seam+1e-8,distance,departure,approach))<1e-6);
  const expected=Math.sqrt((distance/c)**2+4*distance/a);
  assert.ok(Math.abs(previousTime-expected)<expected*1e-12);
}
console.log('PASS: continuous, monotonic journey distance and relativistic Earth clock');
