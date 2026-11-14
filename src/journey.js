'use strict';
// Cinematic clock: reserve screen time for local departure and orbital approach.
// Distances remain in metres; this is not a gravitational transfer solver.
const Journey = (() => {
  const ease = x => {x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  function progress(f, distance, departure, approach) {
    const a=Math.min(.12,departure/distance),b=Math.min(.12,approach/distance);
    if(f<.22)return a*ease(f/.22);
    if(f<.70)return a+(1-a-b)*ease((f-.22)/.48);
    const u=ease((f-.70)/.30);
    // Exponential scale gives the arriving planet time to grow in the viewport.
    return 1-b*(Math.expm1((1-u)*Math.log(65))/64);
  }
  function earthElapsed(s,d,a,c) {
    const half=x=>Math.sqrt((x/c)*(x/c)+2*x/a),total=2*half(d/2);
    return s<.5?half(s*d):total-half((1-s)*d);
  }
  return {ease,progress,earthElapsed};
})();
