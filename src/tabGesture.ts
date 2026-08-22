/** 超过这个速度（像素/毫秒）算「甩」，不再看手指停在哪。 */
export const FLICK_SPEED = 0.45;

/** 松手时停在哪一格：先按位置就近取，再让速度有机会多推一格。 */
export function targetIndex(x: number, step: number, velocity: number, count: number): number {
  const nearest = clamp(Math.round(x / step), count);
  if (Math.abs(velocity) < FLICK_SPEED) return nearest;

  // 甩动：顺着方向多走一格。没有这一步，快速一甩但手指没过中线时
  // 滑块会弹回原处，手感像「没拖动」。
  return clamp(nearest + (velocity > 0 ? 1 : -1), count);
}

/** 拖动中滑块被拉长多少：速度越快、离吸附点越远，拉得越长。 */
export function stretchFactor(speed: number, distanceToSnap: number, step: number): number {
  const bySpeed = Math.min(1, Math.abs(speed) / 1.2) * 0.1;
  const byPull = Math.min(1, Math.abs(distanceToSnap) / Math.max(1, step / 2)) * 0.08;
  return 1 + bySpeed + byPull;
}

function clamp(index: number, count: number) {
  return Math.min(count - 1, Math.max(0, index));
}
