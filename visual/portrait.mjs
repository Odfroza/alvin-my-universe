import {faces} from './voxels.mjs';

const homeYaw = -.19;
const homePitch = .055;
const vert = `
attribute vec3 a_vertex;
attribute vec3 a_normal;
attribute vec3 a_center;
attribute vec3 a_style;
attribute vec3 a_surface;
uniform vec2 u_rotation;
uniform vec2 u_motion;
uniform float u_aspect;
varying float v_light;
void main(){
  float c=cos(u_rotation.x),s=sin(u_rotation.x),a=cos(u_rotation.y),b=sin(u_rotation.y);
  mat3 r=mat3(1.,0.,0.,0.,a,b,0.,-b,a)*mat3(c,0.,-s,0.,1.,0.,s,0.,c);
  vec3 center=a_center;
  if(a_style.z>0.){
    float phase=dot(center,vec3(2.35,3.1,4.7));
    float t=u_motion.x;
    vec3 outward=normalize(center+vec3(.01,0.,.3));
    vec3 eddy=vec3(.076*sin(.67*t+phase),.065*sin(.92*t-phase),.073*sin(.58*t+.6*phase));
    center+=a_style.z*(eddy+1.18*u_motion.y*outward);
  }
  vec3 p=r*(center+a_vertex*a_style.x*.5);
  gl_Position=vec4(p.x/(3.525*u_aspect),p.y/3.525,-p.z/15.,1.);
  vec3 n=r*a_normal, lamp=normalize(vec3(-.43,.62,.73));
  float facet=max(0.,dot(n,lamp));
  vec3 smoothNormal=r*a_surface;
  float diffuse=dot(smoothNormal,smoothNormal)>.2 ? max(0.,dot(normalize(smoothNormal),lamp)) : facet;
  float shade=.41+.44*diffuse+.30*facet;
  v_light=clamp(a_style.y*shade+.019*pow(1.-abs(n.z),2.),0.,1.);
}`;
const frag = `precision mediump float; varying float v_light;
void main(){gl_FragColor=vec4(vec3(v_light),1.);}`;

function webglRenderer(canvas, data) {
  const gl = canvas.getContext('webgl', {alpha:true, antialias:true, powerPreference:'low-power'});
  if (!gl) return null;
  const inst = gl.getExtension('ANGLE_instanced_arrays');
  if (!inst) return null;
  const shaders = [], buffers = [], program = gl.createProgram();
  const destroy = () => {
    buffers.forEach(buffer => gl.deleteBuffer(buffer));
    gl.deleteProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
  };
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('Shader unavailable');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Shader link failed');
    gl.useProgram(program);
    const bind = (bytes, attrs, divisor, stride, type = gl.FLOAT, normalized = false) => {
      const buffer = gl.createBuffer();
      buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.STATIC_DRAW);
      for (const [name, offset] of attrs) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 3, type, normalized, stride, offset);
        inst.vertexAttribDivisorANGLE(location, divisor);
      }
    };
    const mesh = [];
    for (const face of faces) for (const i of [0,1,2,0,2,3]) mesh.push(...face.v[i], ...face.n);
    bind(new Float32Array(mesh), [['a_vertex',0], ['a_normal',12]], 0, 24);
    bind(data, [['a_center',0], ['a_style',12]], 1, 24);
    if (data.surfaceNormals) bind(data.surfaceNormals, [['a_surface',0]], 1, 3, gl.BYTE, true);
    const rotation = gl.getUniformLocation(program, 'u_rotation');
    const motion = gl.getUniformLocation(program, 'u_motion');
    const aspect = gl.getUniformLocation(program, 'u_aspect');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
    return {kind:'webgl', destroy, draw(yaw, pitch, time, separation) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(rotation, yaw, pitch);
      gl.uniform2f(motion, time, separation);
      gl.uniform1f(aspect, canvas.width / canvas.height);
      inst.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 36, data.length / 6);
    }};
  } catch (error) {
    destroy();
    throw error;
  }
}

// A projected cube covers several pixels in the software fallback. Many
// surface voxels share one projection, so cache that footprint per frame.
function cubeStamp(size, halfX, halfY, rotation, view, light, scale) {
  const [cy,sy,cp,sp] = rotation;
  const radius = size/2 + .53; // Subpixel overlap at touching voxel edges.
  const reach = Math.ceil(radius*Math.sqrt(3)+1);
  const stamp = [];
  for (let py=-reach; py<=reach; py++) {
    for (let px=-reach; px<=reach; px++) {
      const u=px+.5-halfX, v=halfY-py-.5;
      const origin=[cy*u+sy*sp*v, cp*v, sy*u-cy*sp*v];
      let near=Infinity, far=-Infinity, face=0;
      for (let k=0; k<3; k++) {
        const d=view[k];
        if (Math.abs(d)<.00001) {
          if (Math.abs(origin[k])>radius) { far=Infinity; break; }
          continue;
        }
        const side=Math.sign(d)*radius;
        const entry=(-side-origin[k])/d, exit=(side-origin[k])/d;
        far=Math.max(far,entry);
        if (exit<near) { near=exit; face=k; }
      }
      if (near<far || !Number.isFinite(near)) continue;
      const facet=Math.max(0,Math.sign(view[face])*light[face]);
      const rim=.019*(1-Math.abs(view[face]))**2*255;
      stamp.push({x:px,y:py,z:near/scale,facet,rim});
    }
  }
  return stamp;
}

// The software path projects the same tiles into a small, reusable depth buffer.
function softwareRenderer(canvas, data) {
  const ctx = canvas.getContext('2d', {alpha:true});
  if (!ctx) throw Error('Canvas unavailable');
  const normals = data.surfaceNormals;
  let pixels, depth;
  return {kind:'canvas-3d', destroy(){ pixels = null; depth = null; }, draw(yaw, pitch, time, separation) {
    const w = canvas.width, h = canvas.height;
    if (!pixels || pixels.width !== w || pixels.height !== h) {
      pixels = ctx.createImageData(w, h);
      depth = new Float32Array(w * h);
    }
    pixels.data.fill(0);
    depth.fill(-Infinity);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const scale = h / 7.05, lightLength = Math.hypot(.43, .62, .73);
    // Rotate the studio light into object space once per frame.
    const lx = (-.43*cy + .62*sp*sy - .73*cp*sy) / lightLength;
    const ly = (.62*cp + .73*sp) / lightLength;
    const lz = (-.43*sy - .62*sp*cy + .73*cp*cy) / lightLength;
    const rotation=[cy,sy,cp,sp], view=[-sy*cp,sp,cy*cp], light=[lx,ly,lz];
    const stamps=[];
    for (let i = 0; i < data.length; i += 6) {
      let x = data[i], y = data[i+1], z = data[i+2];
      const drift = data[i+5];
      if (drift) {
        const phase = 2.35*x + 3.1*y + 4.7*z;
        const away = 1.18 * separation / (Math.hypot(x+.01, y, z+.3) || 1);
        x += drift * (.076*Math.sin(.67*time+phase) + away*(x+.01));
        y += drift * (.065*Math.sin(.92*time-phase) + away*y);
        z += drift * (.073*Math.sin(.58*time+.6*phase) + away*(z+.3));
      }
      const dx = cy*x+sy*z, localZ = -sy*x+cy*z;
      const dy = cp*y-sp*localZ, dz = sp*y+cp*localZ;
      const qx=Math.round((w/2+dx*scale)*4), qy=Math.round((h/2-dy*scale)*4);
      const size=Math.max(1,Math.round(data[i+3]*scale*4));
      const key=size*16 + (qx&3) + 4*(qy&3);
      const stamp=stamps[key] ??= cubeStamp(size/4,(qx&3)/4,(qy&3)/4,rotation,view,light,scale);
      const baseX=Math.floor(qx/4), baseY=Math.floor(qy/4), j=i/2;
      const diffuse=normals ? Math.max(0,(lx*normals[j]+ly*normals[j+1]+lz*normals[j+2])/127) : .72;
      const tone=255*data[i+4], ambient=.41+.44*diffuse;
      for (const pixel of stamp) {
        const px=baseX+pixel.x, py=baseY+pixel.y;
        if (px<0 || px>=w || py<0 || py>=h) continue;
        const index=py*w+px, faceDepth=dz+pixel.z;
        if (depth[index]>=faceDepth) continue;
        depth[index]=faceDepth;
        const ink=tone*(ambient+.30*pixel.facet)+pixel.rim;
        const at=index*4;
        pixels.data[at]=pixels.data[at+1]=pixels.data[at+2]=ink;
        pixels.data[at+3]=255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
  }};
}

export function createPortrait(root, {data, reduced, onLost}) {
  let canvas = root.querySelector('canvas'), renderer;
  try { renderer = webglRenderer(canvas, data); } catch { renderer = null; }
  if (!renderer) {
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
    renderer = softwareRenderer(canvas, data);
  }
  const abort = new AbortController();
  const listen = (target, name, fn, options={}) => target.addEventListener(name, fn, {...options, signal:abort.signal});
  const pause = root.querySelector('[data-pause]'), reset = root.querySelector('[data-reset]');
  const controls = root.querySelector('.portrait-controls'), still = root.querySelector('.portrait-fallback');
  const hero = root.closest('.hero');
  let yaw = homeYaw, pitch = homePitch, manualPause = false, manuallyTurned = false;
  let visible = true, drag = null, frame = 0, last = 0, elapsed = 0, separation = 0, disposed = false;
  canvas.hidden = false;
  canvas.removeAttribute('aria-hidden');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Alvin’s voxel portrait. Drag or use the arrow keys to look around the sculpture. Home resets the view.');
  controls.hidden = false;
  root.classList.add('is-ready');
  still.setAttribute('aria-hidden', 'true');
  root.dataset.renderer = renderer.kind;

  function sync() {
    root.dataset.rotation = yaw.toFixed(3);
    root.dataset.motion = reduced ? 'reduced' : manualPause ? 'paused' : 'enabled';
    pause.disabled = reduced;
    pause.setAttribute('aria-pressed', String(reduced || manualPause));
    pause.textContent = reduced ? 'Motion off' : manualPause ? 'Play' : 'Pause';
    pause.setAttribute('aria-label', reduced ? 'Reduced motion enabled' : manualPause ? 'Play portrait motion' : 'Pause portrait motion');
  }
  function cancel() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function schedule() {
    if (!disposed && !frame && visible && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function draw(now) {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    const moving = !reduced && !manualPause;
    const software = renderer.kind === 'canvas-3d';
    if (moving && last && now - last < (software ? 125 : 42)) { schedule(); return; }
    const box = canvas.getBoundingClientRect();
    const ratio = software ? Math.min(1, 500/Math.max(1, box.height, box.width)) : Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(box.width*ratio)), height = Math.max(1, Math.round(box.height*ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    if (moving) {
      if (last) elapsed += Math.min((now-last)/1000, .2);
      const bounds = hero.getBoundingClientRect();
      const leaving = Math.max(0, Math.min(1, -bounds.top/(bounds.height*.88)));
      separation = Math.sin(leaving*Math.PI)*.64;
    }
    const time = reduced ? 0 : elapsed;
    const idleTurn = manuallyTurned ? 0 : .105 * Math.sin(time*.34);
    const spread = reduced ? 0 : separation;
    root.dataset.fragment = spread.toFixed(3);
    renderer.draw(yaw + idleTurn, pitch, time, spread);
    last = now;
    if (moving) schedule();
  }
  function turn(dx, dy) {
    if (!manuallyTurned && !reduced) yaw += .105 * Math.sin(elapsed*.34);
    manuallyTurned = true;
    yaw += dx;
    pitch = Math.max(-.55, Math.min(.55, pitch+dy));
    sync();
    schedule();
  }
  function home() {
    yaw = homeYaw; pitch = homePitch; manuallyTurned = false; elapsed = 0; last = 0;
    sync();
    schedule();
  }
  listen(canvas, 'pointerdown', event => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    drag = [event.clientX, event.clientY];
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  listen(canvas, 'pointermove', event => {
    if (!drag) return;
    turn((event.clientX-drag[0])*.008, (event.clientY-drag[1])*.005);
    drag = [event.clientX, event.clientY];
  });
  const end = () => { drag = null; canvas.classList.remove('dragging'); };
  for (const event of ['pointerup','pointercancel','lostpointercapture']) listen(canvas, event, end);
  listen(canvas, 'keydown', event => {
    const changes = {ArrowLeft:[-.16,0], ArrowRight:[.16,0], ArrowUp:[0,-.09], ArrowDown:[0,.09]};
    if (changes[event.key]) { event.preventDefault(); turn(...changes[event.key]); }
    if (event.key === 'Home') { event.preventDefault(); home(); }
    if (event.key === 'Escape') reset.focus();
  });
  listen(pause, 'click', () => { manualPause = !manualPause; sync(); cancel(); schedule(); });
  listen(reset, 'click', home);
  listen(window, 'resize', schedule, {passive:true});
  listen(window, 'scroll', schedule, {passive:true});
  listen(document, 'visibilitychange', () => { cancel(); schedule(); });
  const observer = window.IntersectionObserver ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    cancel();
    schedule();
  }) : null;
  observer?.observe(root);
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); dispose(); onLost?.(); });
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancel();
    observer?.disconnect();
    abort.abort();
    renderer.destroy();
    canvas.hidden = true;
    canvas.tabIndex = -1;
    canvas.setAttribute('aria-hidden', 'true');
    still.removeAttribute('aria-hidden');
    controls.hidden = true;
    root.classList.remove('is-ready');
    root.dataset.renderer = 'static';
  }
  sync();
  draw(performance.now());
  return {dispose, setReduced(value) { reduced = value; sync(); cancel(); schedule(); }};
}

