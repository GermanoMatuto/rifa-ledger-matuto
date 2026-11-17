import { expect, test } from 'vitest';
import { create } from 'cuer/QrCode';
import { decodeQR } from 'qr/decode.js';
test('WalletConnect QR remains readable with the current QR encoder', () => {
 const value='wc:'+'a'.repeat(64)+'@2?relay-protocol=irn&symKey='+'b'.repeat(64);
 const {grid,edgeLength}=create(value,{errorCorrection:'medium'});
 const scale=5, border=4, width=(edgeLength+border*2)*scale;
 const data=new Uint8ClampedArray(width*width*4).fill(255);
 for(let y=0;y<edgeLength;y++)for(let x=0;x<edgeLength;x++)if(grid[y][x])for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
  const i=(((y+border)*scale+dy)*width+(x+border)*scale+dx)*4;data[i]=data[i+1]=data[i+2]=0;
 }
 expect(decodeQR({width,height:width,data})).toBe(value);
});
