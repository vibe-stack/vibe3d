import sharp from 'sharp'
const path = process.argv[2]
const thr = Number(process.argv[3] ?? 26)
const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H, channels: C } = info
const lum = (i) => 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]
let minX=W, maxX=-1, minY=H, maxY=-1
const colTop = new Array(W).fill(-1), colBot = new Array(W).fill(-1)
const rowL = new Array(H).fill(-1), rowR = new Array(H).fill(-1)
for (let y=0;y<H;y++) for (let x=0;x<W;x++){
  const i=(y*W+x)*C
  if (lum(i)>thr){
    if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y
    if(colTop[x]<0)colTop[x]=y; colBot[x]=y
    if(rowL[y]<0)rowL[y]=x; rowR[y]=x
  }
}
console.log(`size ${W}x${H} bbox x[${minX},${maxX}] y[${minY},${maxY}] w=${maxX-minX+1} h=${maxY-minY+1} aspect=${((maxX-minX+1)/(maxY-minY+1)).toFixed(3)}`)
const bw = maxX-minX+1, bh=maxY-minY+1
console.log('column profile (frac of bbox): x% -> top%, bottom%')
for (let f=0; f<=1.0001; f+=0.05){
  const x = Math.round(minX+f*(bw-1))
  const t = colTop[x], b = colBot[x]
  console.log(`  ${(f*100).toFixed(0).padStart(3)}%  top=${t<0?'--':(((t-minY)/bh)*100).toFixed(1)}  bot=${b<0?'--':(((b-minY)/bh)*100).toFixed(1)}`)
}
console.log('row profile: y% -> left%, right%')
for (let f=0; f<=1.0001; f+=0.05){
  const y = Math.round(minY+f*(bh-1))
  const l = rowL[y], r = rowR[y]
  console.log(`  ${(f*100).toFixed(0).padStart(3)}%  left=${l<0?'--':(((l-minX)/bw)*100).toFixed(1)}  right=${r<0?'--':(((r-minX)/bw)*100).toFixed(1)}`)
}
