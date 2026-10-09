/* Shared paper surface: texture stays on the same triangulated sheet while it curls,
   folds into a ball, and opens again. No scale/fade replacement of the paper. */
(() => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = t => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;
  const noise = (x, y) => Math.sin(x * 127.1 + y * 311.7) * .5 + Math.cos(x * 71.7 - y * 43.1) * .5;
  function texture({ width, height, text = '', color = '#f7edc8', size = 20, font = 'print', padding = 23, top = 25, scroll = 0, bold=false,align='left',ink='#454536',texture:pattern='plain',rich,shape='rounded',resolution=2,scrollbar=0 }) {
    const c = document.createElement('canvas'); c.width = Math.ceil(width * resolution); c.height = Math.ceil(height * resolution);
    const ctx = c.getContext('2d'); ctx.scale(resolution, resolution);const g=PaperShape.geometry(shape,width,height),box={...g.text,width:Math.max(1,g.text.width-scrollbar)};PaperShape.trace(ctx,g,width,height);ctx.clip();c.paperShape=g.shape;c.paperColor=color;ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
    if(PaperShape.custom(shape)){top+=box.y;padding=Math.min(padding,12);}
    if(pattern==='lined'||pattern==='grid') {const step=pattern==='lined'?size*1.85:24;ctx.strokeStyle='#8a805c30';ctx.lineWidth=1;ctx.beginPath();for(let y=((top-scroll)%step+step)%step;y<height;y+=step){ctx.moveTo(0,y);ctx.lineTo(width,y);}if(pattern==='grid')for(let x=0;x<width;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,height);}ctx.stroke();}
    const runs=window.RichText?RichText.normalize(rich,text):[{text}];
    const family=font==='hand'?'KaiTi, STKaiti, serif':'"Microsoft YaHei UI", sans-serif';
    ctx.textBaseline='top';ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.width,box.height);ctx.clip();
    let y=top-scroll,line=[],lineWidth=0,lineSize=size;
    const flush=()=>{let x=align==='center'?box.x+(box.width-lineWidth)/2:align==='right'?box.x+box.width-padding-lineWidth:box.x+padding;
      for(const item of line){ctx.font=item.font;ctx.fillStyle=item.ink;ctx.fillText(item.char,x,y+(lineSize-item.size)*.75);x+=item.width;}
      y+=lineSize*1.85;line=[];lineWidth=0;lineSize=size;};
    for(const run of runs){const px=run.size||size,face=((run.bold??bold)?'700':'400')+' '+px+'px '+family;
      for(const char of run.text){if(char==='\n'){flush();continue;}ctx.font=face;const cw=ctx.measureText(char).width;if(line.length&&lineWidth+cw>box.width-padding*2)flush();line.push({char,font:face,ink:run.ink||ink,size:px,width:cw});lineWidth+=cw;lineSize=Math.max(lineSize,px);}}
    flush();
    ctx.restore(); return c;
  }
  class Surface {
    constructor(canvas, image, rect) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.image = image; this.rect = rect; this.shape=PaperShape.geometry(rect.shape||image.paperShape,rect.width,rect.height,rect.zoom||1);this.cols = 12; this.rows = 16; this.resize(); }
    resize() { const b = this.canvas.getBoundingClientRect(); this.dpr = Math.min(devicePixelRatio || 1, 2); this.canvas.width = Math.ceil(b.width * this.dpr); this.canvas.height = Math.ceil(b.height * this.dpr); }
    point(u, v, options) {
      const { x: ox, y: oy, width: w, height: h } = this.rect;
      const side = options.side || 'right', sign = side === 'left' ? 1 : -1;
      const progress = options.peel || 0;
      const localX = side === 'left' ? u * w : (1 - u) * w;
      const anchor=this.shape.anchors[side],origin=PaperShape.custom(this.shape.shape)?(side==='left'?anchor.x:w-anchor.x)+.52*anchor.y:0;
      const front = progress * (w + h * .32-origin)+(progress?origin:0);
      const normalY = .52, norm = Math.hypot(1, normalY);
      const distance = Math.max(0, (front - localX - normalY * v * h) / norm);
      const radius = 24 + 18 * (options.lift || 0);
      const theta = Math.min(Math.PI, distance / radius);
      const shift = distance > radius * Math.PI ? 2 * distance - Math.PI * radius : distance - radius * Math.sin(theta);
      let x = ox + u * w + sign * shift / norm;
      let y = oy + v * h + shift * normalY / norm;
      let z = radius * (1 - Math.cos(theta));
      y -= z * .28;
      let shade = -Math.sin(theta) * .23 + (theta > Math.PI / 2 ? .12 : 0);
      const fold = options.fold || 0;
      if (fold > 0) {
        const t = smooth(clamp(fold));
        const cx = options.cx ?? ox + w / 2, cy = options.cy ?? oy + h / 2;
        const nx = u * 2 - 1, ny = v * 2 - 1, round = 1 / Math.max(1, Math.hypot(nx, ny));
        const r = options.radius || 36;
        const crinkle = noise(Math.round(u * this.cols), Math.round(v * this.rows));
        const edge = Math.max(Math.abs(nx), Math.abs(ny));
        const bx = cx + nx * round * r * (.93 + crinkle * .09);
        const by = cy + ny * round * r * (.94 + crinkle * .07);
        const ridge = Math.sin(u * Math.PI * 6 + v * 2) * Math.sin(v * Math.PI * 7) * Math.sin(Math.PI * fold);
        x = mix(x, bx, t) + ridge * 17;
        y = mix(y, by, t) + ridge * 12;
        z = mix(z, Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny))) * r + crinkle * 7, t);
        shade = mix(shade, crinkle * .24 - edge * .16, t);
      }
      return { x, y, z, shade, u, v, back: theta > Math.PI / 2 ? (1 - fold) * .68 : 0 };
    }
    draw(options = {}) {
      const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
      if(PaperShape.custom(this.shape.shape)&&(options.fold||0)>.6){ctx.save();ctx.globalAlpha=((options.fold||0)-.6)/.4;ctx.fillStyle=this.image.paperColor||this.rect.color||'#f7edc8';ctx.beginPath();ctx.arc(options.cx??this.rect.x+this.rect.width/2,options.cy??this.rect.y+this.rect.height/2,options.radius||36,0,Math.PI*2);ctx.fill();ctx.restore();}
      const points = [], triangles = [];
      for (let row = 0; row <= this.rows; row++) { const line = []; for (let col = 0; col <= this.cols; col++) line.push(this.point(col / this.cols, row / this.rows, options)); points.push(line); }
      for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) {
        const a = points[row][col], b = points[row][col + 1], c = points[row + 1][col], d = points[row + 1][col + 1];
        triangles.push([a, b, c], [b, d, c]);
      }
      triangles.sort((a, b) => a.reduce((s, p) => s + p.z, 0) - b.reduce((s, p) => s + p.z, 0));
      for (const triangle of triangles) this.triangle(triangle);
      if (options.fold > .06) {
        ctx.save();ctx.globalCompositeOperation='source-atop';ctx.strokeStyle = `rgba(91,75,48,${options.fold * .13})`; ctx.lineWidth = .55;
        for (let i = 0; i < triangles.length; i += 7) { const [a,b,c] = triangles[i]; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(c.x,c.y); ctx.stroke(); }ctx.restore();
      }
    }
    triangle([a,b,c]) {
      const ctx = this.ctx, iw = this.image.width, ih = this.image.height;
      const sx0 = a.u * iw, sy0 = a.v * ih, sx1 = b.u * iw, sy1 = b.v * ih, sx2 = c.u * iw, sy2 = c.v * ih;
      const den = sx0 * (sy1-sy2) + sx1 * (sy2-sy0) + sx2 * (sy0-sy1); if (Math.abs(den) < .001) return;
      const affine = field => [(a[field]*(sy1-sy2)+b[field]*(sy2-sy0)+c[field]*(sy0-sy1))/den, (a[field]*(sx2-sx1)+b[field]*(sx0-sx2)+c[field]*(sx1-sx0))/den, (a[field]*(sx1*sy2-sx2*sy1)+b[field]*(sx2*sy0-sx0*sy2)+c[field]*(sx0*sy1-sx1*sy0))/den];
      const [aa,cc,ee] = affine('x'), [bb,dd,ff] = affine('y');
      const cx = (a.x+b.x+c.x)/3, cy = (a.y+b.y+c.y)/3;
      const expand = p => { const d = Math.hypot(p.x-cx,p.y-cy) || 1; return { x:p.x+(p.x-cx)/d*.55, y:p.y+(p.y-cy)/d*.55 }; };
      const ap=expand(a),bp=expand(b),cp=expand(c);
      ctx.save(); ctx.beginPath(); ctx.moveTo(ap.x,ap.y); ctx.lineTo(bp.x,bp.y); ctx.lineTo(cp.x,cp.y); ctx.closePath(); ctx.clip();
      ctx.transform(aa,bb,cc,dd,ee,ff); ctx.drawImage(this.image,0,0); ctx.restore();
      ctx.save();ctx.globalCompositeOperation='source-atop';
      const shade = (a.shade+b.shade+c.shade)/3, back = (a.back+b.back+c.back)/3;
      ctx.beginPath(); ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();
      if (back > 0) { ctx.fillStyle = `rgba(255,250,226,${back})`; ctx.fill(); }
      ctx.fillStyle = shade < 0 ? `rgba(65,48,24,${-shade})` : `rgba(255,255,248,${shade})`; ctx.fill();ctx.restore();
    }
  }
  function animate(ms, update) {
    return new Promise(resolve => { const start = performance.now(); function frame(now) { const t = clamp((now-start)/ms); update(smooth(t)); if (t < 1) requestAnimationFrame(frame); else resolve(); } requestAnimationFrame(frame); });
  }
  window.PaperMotion = { texture, Surface, animate, clamp, mix };
})();
