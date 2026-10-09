function clampBounds(bounds, area) {
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
  return { width, height, x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))) };
}
function inside(point, bounds, inset = 0) {
  return point.x >= bounds.x + inset && point.x <= bounds.x + bounds.width - inset && point.y >= bounds.y + inset && point.y <= bounds.y + bounds.height - inset;
}
function stepFall(body, area, dt) {
  const floor = area.y + area.height - body.height - 8;
  body.vy += 1800 * dt; body.y += body.vy * dt; body.x += body.vx * dt;
  if (body.y >= floor) { body.y = floor; body.vy = -Math.abs(body.vy) * .3; body.vx *= .55; if (Math.abs(body.vy) < 55) { body.vy = 0; body.vx = 0; body.rest = true; } }
  if (body.x < area.x || body.x > area.x + area.width - body.width) { body.x = Math.max(area.x, Math.min(body.x, area.x + area.width - body.width)); body.vx *= -.4; }
  return body;
}
function gatherSlots(area,count,obstacles=[]) {
  const result=[],width=92,height=96,gap=8;
  for(let y=area.y+area.height-height-8;y>=area.y+8&&result.length<count;y-=height+gap){
    for(let x=area.x+12;x+width<=area.x+area.width-12&&result.length<count;x+=width+gap){
      const b={x,y,width,height};
      if(!obstacles.some(o=>b.x<o.x+o.width+gap&&b.x+b.width+gap>o.x&&b.y<o.y+o.height+gap&&b.y+b.height+gap>o.y))result.push(b);
    }
  }
  return result;
}
module.exports = { clampBounds, inside, stepFall, gatherSlots };
