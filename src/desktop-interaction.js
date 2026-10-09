// Only visible paper, tools and dialogs consume pointer input.
let ignored = false, lastPointer;
window.refreshDesktopHitTest = () => {
  if (!lastPointer || lastPointer.buttons) return;
  // Re-evaluate visible content when a menu disappears beneath the stationary mouse.
  const target = document.elementFromPoint(lastPointer.x, lastPointer.y);
  let hit = target?.closest('#paper, header, #toolbar, .appearance, footer, .page-heading, dialog, #resize-handle, #resize-left, #side-menu, #tools, #orb, #desktop-object, #object-preview, #shelf-area, #unload');
  if(window.PaperShape&&document.body.classList.contains('shaped-paper')&&target?.closest('#paper')&&!target.closest('.tear-handle')){
    const sheet=document.querySelector('#sheet'),r=sheet.getBoundingClientRect(),x=lastPointer.x-r.x,y=lastPointer.y-r.y;
    const zoom=Number(getComputedStyle(document.body).getPropertyValue('--paper-zoom'))||1;
    if(y<0||!PaperShape.contains(PaperShape.geometry(document.querySelector('#paper').dataset.shape,r.width,r.height,zoom),x,y))hit=null;
  }
  if(target?.closest('#paper')&&!target.closest('.tear-handle')&&lastPointer.y<document.querySelector('#sheet').getBoundingClientRect().y)hit=null;
  if(target?.closest('#desktop-object')&&window.toyContainsPoint&&!window.toyContainsPoint(lastPointer.x,lastPointer.y))hit=null;
  if(window.PaperShape&&target?.closest('#object-preview.shaped-preview')&&!target.closest('.dialog-actions,#object-date')){
    const paper=document.querySelector('#object-paper'),r=paper.getBoundingClientRect(),g=PaperShape.geometry(document.querySelector('#object-preview').dataset.shape,r.width,r.height);
    if(!PaperShape.contains(g,lastPointer.x-r.x,lastPointer.y-r.y))hit=null;
  }
  const ignore = !hit && !document.querySelector('dialog[open]');
  if (ignore !== ignored) { ignored = ignore; window.desk.call('hit-test', { ignore }).catch(() => {}); }
};
document.addEventListener('pointermove', event => {
  lastPointer={x:event.clientX,y:event.clientY,buttons:event.buttons};
  window.refreshDesktopHitTest();
});
function attachDesktopDrag(element, resize = false, enabled = () => true) {
  let start = null, moved = false, chain = Promise.resolve();
  const send = (phase, event) => {
    const data = { phase, x: event.screenX, y: event.screenY, resize, shift: event.shiftKey };
    chain = chain.then(() => window.desk.call('gesture', data)).catch(() => {});
    return chain;
  };
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !enabled(event)) return;
    start = { x: event.screenX, y: event.screenY }; moved = false;
    element.setPointerCapture(event.pointerId); event.preventDefault(); send('start', event);
  });
  element.addEventListener('pointermove', event => {
    if (!start) return;
    moved ||= Math.hypot(event.screenX - start.x, event.screenY - start.y) > 5;
    if (moved) send('move', event);
  });
  element.addEventListener('pointerup', async event => {
    if (!start) return; start = null;
    await send(moved ? 'end' : 'cancel', event);
    if (!moved) element.dispatchEvent(new CustomEvent('desktop-click'));
  });
  element.addEventListener('pointercancel', event => { start = null; send('cancel', event); });
}
