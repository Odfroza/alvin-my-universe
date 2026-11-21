import {faces} from './voxels.mjs';
const homeYaw=-.19, homePitch=.055;
const vert = `
attribute vec3 a_vertex;
attribute vec3 a_normal;
attribute vec3 a_center;
attribute vec3 a_style;
uniform vec2 u_rotation;
uniform vec2 u_motion;
uniform float u_aspect;
varying float v_light;
void main(){
 float c=cos(u_rotation.x),s=sin(u_rotation.x),a=cos(u_rotation.y),b=sin(u_rotation.y);
 mat3 r=mat3(1.,0.,0.,0.,a,b,0.,-b,a)*mat3(c,0.,-s,0.,1.,0.,s,0.,c);
 float drift=a_style.z;
 vec3 dir=normalize(a_center+vec3(.01,0.,.3));
 float delta=drift*(u_motion.y*1.25+.05*sin(u_motion.x*.65+a_center.y*2.));
 vec3 p=r*(a_center+a_vertex*a_style.x*.5+dir*delta);
 gl_Position=vec4(p.x/(3.525*u_aspect),p.y/3.525,-p.z/15.,1.);
 vec3 n=r*a_normal;
 float lit=max(0.,dot(n,normalize(vec3(-.43,.62,.73))));
 v_light=clamp(a_style.y*(.37+.77*lit)+.029*pow(1.-abs(n.z),2.),0.,1.);
}`;
const frag = `precision mediump float; varying float v_light; void main(){gl_FragColor=vec4(vec3(v_light),1.);}`;

function webglRenderer(canvas,data){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});
  if(!gl) return null;
  const inst=gl.getExtension('ANGLE_instanced_arrays');
  if(!inst) return null;
  const shaders=[],buffers=[],program=gl.createProgram();
  const destroy=()=>{buffers.forEach(b=>gl.deleteBuffer(b));gl.deleteProgram(program);shaders.forEach(s=>gl.deleteShader(s));};
  try{
    for(const [type,source] of [[gl.VERTEX_SHADER,vert],[gl.FRAGMENT_SHADER,frag]]){
      const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Shader unavailable');
      gl.attachShader(program,s);
    }
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader link failed');
    gl.useProgram(program);
    const bind=(bytes,attrs,divisor)=>{
      const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,bytes,gl.STATIC_DRAW);
      for(const [name,offset] of attrs){
        const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,offset);inst.vertexAttribDivisorANGLE(a,divisor);
      }
    };
    const mesh=[];for(const f of faces)for(const i of [0,1,2,0,2,3])mesh.push(...f.v[i],...f.n);
    bind(new Float32Array(mesh),[['a_vertex',0],['a_normal',12]],0);
    bind(data,[['a_center',0],['a_style',12]],1);
    const u=name=>gl.getUniformLocation(program,'u_'+name), rot=u('rotation'),motion=u('motion'),aspect=u('aspect');
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,0,0,0);
    return {kind:'webgl',destroy,draw(yaw,pitch,t,separation){
      gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(rot,yaw,pitch);gl.uniform2f(motion,t,separation);gl.uniform1f(aspect,canvas.width/canvas.height);
      inst.drawArraysInstancedANGLE(gl.TRIANGLES,0,36,data.length/6);
    }};
  }catch(error){destroy();throw error;}
}

// The quiet software path projects the same volume into a depth buffer. It uses
// small shaded tiles at screen resolution instead of allocating a mesh per cube.
function softwareRenderer(canvas,data){
  const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('Canvas unavailable');
  let pixels,depth;
  return {kind:'canvas-3d',destroy(){pixels=null;depth=null;},draw(yaw,pitch,t,fragment){
    const w=canvas.width,h=canvas.height;
    if(!pixels || pixels.width!==w || pixels.height!==h){pixels=ctx.createImageData(w,h);depth=new Float32Array(w*h);}
    pixels.data.fill(0);depth.fill(-Infinity);
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),scale=h/7.05;
    for(let i=0;i<data.length;i+=6){
      let x=data[i],y=data[i+1],z=data[i+2];const v=data[i+5]*(fragment*1.25+.05*Math.sin(t*.65+y*2));
      if(v){const norm=Math.hypot(x+.01,y,z+.3)||1;x+=v*(x+.01)/norm;y+=v*y/norm;z+=v*(z+.3)/norm;}
      const dx=cy*x+sy*z,b=-sy*x+cy*z,dy=cp*y-sp*b,dz=sp*y+cp*b;
      const size=Math.max(1,Math.ceil(data[i+3]*scale)),left=Math.round(w/2+dx*scale-size/2),top=Math.round(h/2-dy*scale-size/2);
      const endX=Math.min(w,left+size),endY=Math.min(h,top+size),tone=data[i+4]*243;
      for(let py=Math.max(0,top);py<endY;py++)for(let px=Math.max(0,left);px<endX;px++){
        const p=py*w+px;if(depth[p]>=dz)continue;
        depth[p]=dz;const ink=(px===endX-1||py===endY-1)?tone*.82:tone, at=p*4;
        pixels.data[at]=pixels.data[at+1]=pixels.data[at+2]=ink;pixels.data[at+3]=255;
      }
    }
    ctx.putImageData(pixels,0,0);
  }};
}
export function createPortrait(root,{data,reduced,onLost}){
  let canvas=root.querySelector('canvas'),renderer;
  try{renderer=webglRenderer(canvas,data);}catch{renderer=null;}
  if(!renderer){const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;renderer=softwareRenderer(canvas,data);}
  const abort=new AbortController(),options={signal:abort.signal};
  const listen=(target,name,fn,extra={})=>target.addEventListener(name,fn,{...options,...extra});
  const pause=root.querySelector('[data-pause]'),reset=root.querySelector('[data-reset]'),controls=root.querySelector('.portrait-controls');
  const still=root.querySelector('.portrait-fallback'),hero=root.closest('.hero');
  let yaw=homeYaw,pitch=homePitch,manualPause=false,visible=true,drag=null,frame=0,last=0,disposed=false;
  canvas.hidden=false;canvas.removeAttribute('aria-hidden');canvas.tabIndex=0;
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Alvin’s voxel portrait. Drag or use arrow keys to rotate. Home resets the view.');
  controls.hidden=false;root.classList.add('is-ready');still.setAttribute('aria-hidden','true');root.dataset.renderer=renderer.kind;
  function sync(){
    root.dataset.rotation=yaw.toFixed(3);root.dataset.motion=reduced?'reduced':manualPause?'paused':'enabled';
    pause.disabled=reduced;pause.setAttribute('aria-pressed',String(reduced||manualPause));
    pause.textContent=reduced?'Motion off':manualPause?'Play':'Pause';
    pause.setAttribute('aria-label',reduced?'Reduced motion enabled':manualPause?'Play portrait motion':'Pause portrait motion');
  }
  function cancel(){cancelAnimationFrame(frame);frame=0;}
  function schedule(){if(!disposed&&!frame&&visible&&!document.hidden)frame=requestAnimationFrame(draw);}
  function draw(now){
    frame=0;if(disposed||!visible||document.hidden)return;
    const moving=!reduced&&!manualPause;
    if(moving && now-last<(renderer.kind==='webgl'?45:100)){schedule();return;}
    const r=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,renderer.kind==='webgl'?1.5:1);
    const w=Math.max(1,Math.round(r.width*ratio)),h=Math.max(1,Math.round(r.height*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const box=hero.getBoundingClientRect(),leaving=Math.max(0,Math.min(1,-box.top/(box.height*.88)));
    const separation=moving?Math.sin(leaving*Math.PI)*.64:0;
    root.dataset.fragment=separation.toFixed(3);renderer.draw(yaw,pitch,moving?now/1000:0,separation);last=now;
    if(moving)schedule();
  }
  function turn(dx,dy){yaw+=dx;pitch=Math.max(-.5,Math.min(.5,pitch+dy));sync();schedule();}
  function home(){yaw=homeYaw;pitch=homePitch;sync();schedule();}
  listen(canvas,'pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0)return;drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
  listen(canvas,'pointermove',e=>{if(!drag)return;turn((e.clientX-drag[0])*.008,(e.clientY-drag[1])*.005);drag=[e.clientX,e.clientY];});
  const end=()=>{drag=null;canvas.classList.remove('dragging');};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,event,end);
  listen(canvas,'keydown',e=>{
    const changes={ArrowLeft:[-.16,0],ArrowRight:[.16,0],ArrowUp:[0,-.09],ArrowDown:[0,.09]};
    if(changes[e.key]){e.preventDefault();turn(...changes[e.key]);}
    if(e.key==='Home'){e.preventDefault();home();}if(e.key==='Escape'){reset.focus();}
  });
  listen(pause,'click',()=>{manualPause=!manualPause;sync();cancel();schedule();});listen(reset,'click',home);
  listen(window,'resize',schedule,{passive:true});listen(window,'scroll',schedule,{passive:true});
  listen(document,'visibilitychange',()=>{cancel();schedule();});
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;cancel();schedule();});observer.observe(root);
  listen(canvas,'webglcontextlost',e=>{e.preventDefault();dispose();onLost?.();});
  function dispose(){
    if(disposed)return;disposed=true;cancel();observer.disconnect();abort.abort();renderer.destroy();
    canvas.hidden=true;canvas.tabIndex=-1;canvas.setAttribute('aria-hidden','true');still.removeAttribute('aria-hidden');
    controls.hidden=true;root.classList.remove('is-ready');root.dataset.renderer='static';
  }
  sync();draw(performance.now());return {dispose,setReduced(v){reduced=v;sync();cancel();schedule();}};
}
