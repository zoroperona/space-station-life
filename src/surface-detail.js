'use strict';
// Spherical, derivative-filtered terrain: no 512px coastline or longitude seam.
// Exoplanet geography is artistic, not an observed map.
const SurfaceDetail = {glsl: `
uniform float procKind; uniform float procSeed;
uniform vec3 palette0; uniform vec3 palette1; uniform vec3 palette2; uniform vec3 palette3;
float hash3(vec3 p) {p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p) {
  vec3 i=floor(p), f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float terrainFbm(vec3 p) {
  float sum=0.0, amplitude=.5, footprint=max(length(dFdx(p)),length(dFdy(p)));
  for(int i=0;i<8;i++) {
    float weight=1.0-smoothstep(.35,1.0,footprint);
    sum+=amplitude*mix(.5,noise3(p),weight);p=p*2.03+vec3(7.1,11.8,3.9);amplitude*=.5;footprint*=2.03;
  }
  return sum/0.9961;
}
float craterField(vec3 sphere,float frequency){
  vec3 p=sphere*frequency,cell=floor(p);float result=0.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
    vec3 corner=cell+vec3(float(x),float(y),float(z));
    float seed=hash3(corner+procSeed),radius=.45+seed*.25;
    vec3 impact=corner+vec3(.5)+vec3(seed-.5,hash3(corner+17.0)-.5,hash3(corner+31.0)-.5)*.3;
    float d=length(p-impact)/radius;
    float bowl=-.75*(1.0-smoothstep(.0,.85,d));
    float rim=.3*exp(-pow((d-.90)/.12,2.0));
    result+=bowl+rim;
  }
  return result;
}
vec3 terrainColor(vec3 sphere, out float elevation, out float water) {
  vec3 p=sphere*3.4+vec3(procSeed*.173,procSeed*.371,procSeed*.117);
  vec3 warp=vec3(noise3(p+7.0),noise3(p+19.0),noise3(p+31.0))-.5;
  float land=terrainFbm(p+warp*1.5);
  float ridges=1.0-abs(2.0*terrainFbm(p*9.0+warp*3.0)-1.0);
  float grain=terrainFbm(p*90.0);
  water=0.0;elevation=land*.003+ridges*.0003;
  vec3 color=mix(palette0,palette2,smoothstep(.23,.76,land));
  if(procKind==2.0) {
    float shore=.505;
    water=1.0-smoothstep(shore-.0015,shore+.0015,land);
    vec3 sea=mix(palette0*.38,palette1*.7,smoothstep(.30,shore,land));
    sea=mix(sea,vec3(.075,.30,.32),smoothstep(shore-.018,shore,land)*.55);
    float mountains=smoothstep(.54,.69,land)*pow(ridges,4.0);
    vec3 ground=mix(palette2*.73,palette3,smoothstep(shore,.65,land));
    ground=mix(ground,vec3(.19,.22,.18),mountains*.5);
    ground*=.65+.65*grain;
    ground=mix(ground,ground*.62,smoothstep(.55,.85,ridges)*smoothstep(.53,.65,land)*.6);
    ground=mix(ground,vec3(.65,.59,.43),1.0-smoothstep(shore,shore+.0025,land));
    float ice=smoothstep(.93,.995,abs(sphere.y))+smoothstep(.57,.78,mountains)*smoothstep(.65,.76,land);
    ground=mix(ground,vec3(.81,.86,.87),clamp(ice,0.0,1.0));
    color=mix(ground,sea,water);elevation=(max(land-shore,0.0)*.014+mountains*.0012)*(1.0-water);
  } else if(procKind==3.0) {
    float cracks=1.0-smoothstep(.003,.018,abs(terrainFbm(p*12.0+warp*4.0)-.5));
    color=mix(palette0,palette2,smoothstep(.3,.66,land));color*=1.0-cracks*.38;
    color*=.88+grain*.24;elevation=land*.0015-cracks*.00012;
  } else if(procKind==4.0) {
    float fissure=1.0-smoothstep(.004,.025,abs(terrainFbm(p*8.0+warp)-.5));
    color*=.65+grain*.45;color=mix(color,vec3(1.0,.18,.015),fissure*.85);elevation+=grain*.0003;
  } else {
    float craters=craterField(sphere,32.0)+craterField(sphere,93.0)*.35;
    float visible=1.0-smoothstep(.003,.025,max(length(dFdx(sphere)),length(dFdy(sphere))));
    float micro=terrainFbm(sphere*18000.0+procSeed);
    color*=.62+grain*.6+craters*.35*visible+micro*.16;elevation+=ridges*.001+grain*.0002+craters*.0006*visible;
  }
  return color;
}
float weather(vec3 sphere) {
  vec3 p=sphere*5.0+vec3(procSeed*.13,7.3,procSeed*.29);
  vec3 warp=vec3(terrainFbm(p+11.0),terrainFbm(p+29.0),terrainFbm(p+47.0))-.5;
  float large=terrainFbm(p+warp*2.4);
  float fine=terrainFbm(p*12.0+warp*6.0);
  float cirrus=terrainFbm(p*38.0+warp*8.0);
  return smoothstep(.535,.70,large*.74+fine*.20+cirrus*.06);
}
`};
