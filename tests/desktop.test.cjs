const test = require('node:test');
const assert = require('node:assert/strict');
const { clampBounds, inside, stepFall } = require('../src/desktop.cjs');
test('掉落最终停止并避开任务栏工作区', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const body = { x: 1850, y: 100, width: 92, height: 96, vx: 200, vy: 0 };
  for (let i = 0; i < 600 && !body.rest; i++) stepFall(body, area, 1 / 60);
  assert(body.rest); assert.equal(body.y, 936); assert(body.x <= 1828); assert.equal(body.vy, 0);
});
test('负坐标副屏拖动边界及过大窗口校正', () => {
  const area = { x: -1280, y: 0, width: 1280, height: 984 };
  assert.deepEqual(clampBounds({ x: -1500, y: 900, width: 92, height: 96 }, area), { x: -1280, y: 888, width: 92, height: 96 });
  assert.deepEqual(clampBounds({ x: 0, y: 0, width: 2000, height: 1200 }, area), { x: -1280, y: 0, width: 1280, height: 984 });
});
test('纸团只能投放到可见纸面内部，透明边缘不算命中', () => {
  const b = { x: 100, y: 100, width: 370, height: 470 };
  assert(inside({ x: 200, y: 200 }, b, 12)); assert(!inside({ x: 105, y: 105 }, b, 12)); assert(!inside({ x: 500, y: 200 }, b, 12));
});
