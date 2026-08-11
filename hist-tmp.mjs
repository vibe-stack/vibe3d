import sharp from 'sharp'
async function stats(path, label) {
  const { data, info } = await sharp(path).resize(760, 512, {fit:'fill'}).raw().toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const lum = []
  for (let i = 0; i < info.width*info.height; i++) {
    const l = (0.2126*data[i*ch] + 0.7152*data[i*ch+1] + 0.0722*data[i*ch+2]) / 255
    if (l > 0.06) lum.push(l)
  }
  lum.sort((a,b)=>a-b)
  const q = p => lum[Math.floor(lum.length*p)].toFixed(3)
  const mean = (lum.reduce((a,b)=>a+b,0)/lum.length).toFixed(3)
  const frac = t => (lum.filter(l=>l>t).length/lum.length*100).toFixed(1)
  console.log(`${label}: mean=${mean} p25=${q(0.25)} p50=${q(0.50)} p75=${q(0.75)} p90=${q(0.90)}  %>0.55=${frac(0.55)}  %<0.30=${(100-frac(0.30)).toFixed(1)}`)
}
await stats('docs/assets/reusable/architecture/building-prefab-assemblies/small-building-shell.png', 'REFERENCE')
await stats(process.argv[2], 'RENDER   ')
