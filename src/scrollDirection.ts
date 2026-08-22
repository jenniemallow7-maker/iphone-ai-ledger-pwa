/** 滚动位置在这以内一律展开——顶部不该藏导航。 */
export const EXPAND_BELOW = 48;
/** 超过这个位置才允许收起。和上面构成迟滞区间，避免在临界点反复横跳。 */
export const COLLAPSE_ABOVE = 96;
/** 小于这个位移当作抖动忽略。 */
export const NOISE = 6;

export interface CompactState {
  compact: boolean;
  lastY: number;
}

/**
 * 由滚动位置推出标签栏该收起还是展开。抽成纯函数是为了能直接测——
 * 真实环境里它被包在 requestAnimationFrame 里，测试环境跑不了 rAF。
 */
export function nextCompactState(y: number, previous: CompactState): CompactState {
  if (y <= EXPAND_BELOW) return { compact: false, lastY: y };

  const delta = y - previous.lastY;
  if (Math.abs(delta) <= NOISE) return { compact: previous.compact, lastY: previous.lastY };

  // 往上滚随时恢复；往下滚要过了迟滞区间才收起。
  if (delta < 0) return { compact: false, lastY: y };
  if (y > COLLAPSE_ABOVE) return { compact: true, lastY: y };

  return { compact: previous.compact, lastY: y };
}
