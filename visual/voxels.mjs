export const faces = [
  {n:[0,0,1],v:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]},
  {n:[0,0,-1],v:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]},
  {n:[1,0,0],v:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]},
  {n:[-1,0,0],v:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]},
  {n:[0,1,0],v:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]},
  {n:[0,-1,0],v:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]}
];
export function rotatePoint([x,y,z],yaw,pitch) {
  const a=x*Math.cos(yaw)+z*Math.sin(yaw), b=-x*Math.sin(yaw)+z*Math.cos(yaw);
  return [a,y*Math.cos(pitch)-b*Math.sin(pitch),y*Math.sin(pitch)+b*Math.cos(pitch)];
}
export function decodeVoxels(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 8) throw Error('Incomplete portrait model');
  const version = view.getUint32(0);
  const hasNormals = version === 0x41565832; // AVX2
  if (!hasNormals && version !== 0x41565831) throw Error('Unrecognized portrait model');
  const count = view.getUint32(4, true);
  const stride = hasNormals ? 12 : 10;
  if (!count || count > 100000 || view.byteLength !== 8 + count * stride) throw Error('Incomplete portrait model');
  const data = new Float32Array(count * 6);
  if (hasNormals) data.surfaceNormals = new Int8Array(count * 3);
  for (let i = 0; i < count; i++) {
    const p = 8 + i * stride, j = i * 6;
    data[j] = view.getInt16(p, true) / 4096;
    data[j + 1] = view.getInt16(p + 2, true) / 4096;
    data[j + 2] = view.getInt16(p + 4, true) / 4096;
    data[j + 3] = view.getUint16(p + 6, true) / 4096;
    data[j + 4] = view.getUint8(p + 8) / 255;
    data[j + 5] = view.getUint8(p + 9) / 255;
    if (hasNormals) {
      let x = view.getInt8(p + 10) / 127, y = view.getInt8(p + 11) / 127;
      const z = 1 - Math.abs(x) - Math.abs(y);
      if (z < 0) {
        const originalX = x;
        x = (1 - Math.abs(y)) * (x < 0 ? -1 : 1);
        y = (1 - Math.abs(originalX)) * (y < 0 ? -1 : 1);
      }
      const scale = 127 / Math.hypot(x, y, z);
      data.surfaceNormals[i * 3] = Math.round(x * scale);
      data.surfaceNormals[i * 3 + 1] = Math.round(y * scale);
      data.surfaceNormals[i * 3 + 2] = Math.round(z * scale);
    }
  }
  return data;
}
