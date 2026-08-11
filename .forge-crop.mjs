import sharp from 'sharp'
const [src, out, l, t, w, h, scale] = process.argv.slice(2)
await sharp(src).extract({ left:+l, top:+t, width:+w, height:+h }).resize({ width: Math.round(+w*(+scale||1)) }).toFile(out)
console.log('ok', out)
