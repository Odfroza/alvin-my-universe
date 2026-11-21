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
  const d=new DataView(buffer);
  if (d.byteLength<8 || d.getUint32(0)!==0x41565831) throw Error('Unrecognized portrait model');
  const count=d.getUint32(4,true);
  if (!count || count>100000 || d.byteLength!==8+count*10) throw Error('Incomplete portrait model');
  const data=new Float32Array(count*6);
  for(let i=0;i<count;i++){
    const p=8+i*10, j=i*6;
    data[j]=d.getInt16(p,true)/4096; data[j+1]=d.getInt16(p+2,true)/4096;
    data[j+2]=d.getInt16(p+4,true)/4096; data[j+3]=d.getUint16(p+6,true)/4096;
    data[j+4]=d.getUint8(p+8)/255; data[j+5]=d.getUint8(p+9)/255;
  }
  return data;
}
