// Soft paper balls use stable box contacts; all coordinates are desktop DIPs.
// Resting contacts sleep, but support is checked again whenever the pile changes.
const {advance}=require('./toy-physics.js');
function supported(b, bodies, area, seen = new Set()) {
  if (Math.abs(b.y + b.height - (area.y + area.height - 8)) < 2) return true;
  if (seen.has(b)) return false;
  seen.add(b);
  return bodies.some(o => o !== b && !o.captured && o.rest && Math.abs(b.y + b.height - o.y) < 2 &&
    Math.min(b.x + b.width, o.x + o.width) - Math.max(b.x, o.x) > 8 && supported(o, bodies, area, new Set(seen)));
}
function stepPile(bodies, area, dt, {onMove,onStep}={}) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
  const impacts = new Set();
  for (let step = 0; step < steps; step++) {
    onStep?.();
    for (const b of bodies) {
      if(b.captured)continue;
      if (b.rest && !supported(b, bodies, area)) b.rest = false;
      if (!b.rest) {const before={...b};advance(b,h);onMove?.(b,before);}
    }
    // Several contact passes settle chains without letting upper balls sink.
    for (let pass = 0; pass < 4; pass++) {
      for (const b of bodies) {
        if(b.captured)continue;
        const floor = area.y + area.height - b.height - 8;
        if (b.y >= floor) {
          if (b.vy > 180 && pass === 0) impacts.add(b);
          b.y = floor; b.vy = b.vy > 140 ? -b.vy * .24 : Math.min(0, b.vy);
          b.vx *= .88;
        }
        const right = area.x + area.width - b.width;
        if (b.x < area.x || b.x > right) { b.x = Math.max(area.x, Math.min(right, b.x)); b.vx *= -.35; }
        if(b.y<area.y){b.y=area.y;b.vy=Math.abs(b.vy)*.3;}
      }
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if(a.captured||b.captured)continue;
        const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        const vertical = oy <= ox, nx = vertical ? 0 : (a.x < b.x ? 1 : -1), ny = vertical ? (a.y < b.y ? 1 : -1) : 0;
        // A resting base supports the moving ball; sideways impacts can wake it.
        if (!vertical) { a.rest = false; b.rest = false; }
        let ma = a.rest ? 0 : 1, mb = b.rest ? 0 : 1;
        if (!ma && !mb) { if (vertical) { (ny > 0 ? a : b).rest = false; ma = a.rest ? 0 : 1; mb = b.rest ? 0 : 1; } else ma = mb = 1; }
        const total = ma + mb, penetration = (vertical ? oy : ox) + .01;
        a.x -= nx * penetration * ma / total; a.y -= ny * penetration * ma / total;
        b.x += nx * penetration * mb / total; b.y += ny * penetration * mb / total;
        const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (closing < 0) {
          if (closing < -180) { impacts.add(a); impacts.add(b); }
          const impulse = -(1 + (closing < -140 ? .2 : 0)) * closing / total;
          a.vx -= impulse * ma * nx; a.vy -= impulse * ma * ny;
          b.vx += impulse * mb * nx; b.vy += impulse * mb * ny;
          if (vertical) { a.vx *= .8; b.vx *= .8; }
        }
      }
    }
    // Bottom first lets an entire stable stack sleep in a single step.
    for (const b of [...bodies].sort((a,b) => b.y-a.y)) {
      if(b.captured)continue;
      if (Math.abs(b.vx) < 4 && Math.abs(b.vy) < 4 && supported(b, bodies, area)) { b.vx = b.vy = 0; b.rest = true; }
    }
  }
  return impacts;
}
module.exports = { stepPile, supported };
