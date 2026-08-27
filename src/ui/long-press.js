export const CARD_DETAILS_LONG_PRESS_MS = 520;

export function attachLongPress(node, onLongPress, {
  delayMs = CARD_DETAILS_LONG_PRESS_MS,
  movementTolerance = 12,
} = {}) {
  let timer = null;
  let pointerId = null;
  let origin = null;
  let suppressNextClick = false;

  const disarm = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    pointerId = null;
    origin = null;
    node.classList.remove('long-press-arming');
  };

  node.addEventListener('pointerdown', (event) => {
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    disarm();
    pointerId = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    node.classList.add('long-press-arming');
    node.setPointerCapture?.(event.pointerId);
    timer = setTimeout(() => {
      timer = null;
      if (pointerId == null) return;
      suppressNextClick = true;
      node.classList.remove('long-press-arming');
      node.classList.add('long-press-fired');
      setTimeout(() => node.classList.remove('long-press-fired'), 240);
      onLongPress(event);
    }, delayMs);
  });

  node.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId || !origin) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > movementTolerance) disarm();
  });
  node.addEventListener('pointerup', disarm);
  node.addEventListener('pointercancel', disarm);
  node.addEventListener('lostpointercapture', disarm);
  node.addEventListener('contextmenu', (event) => event.preventDefault());
  node.addEventListener('click', (event) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  return node;
}
