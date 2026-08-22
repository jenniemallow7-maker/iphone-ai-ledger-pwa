/**
 * 轻触反馈。
 *
 * Android Chrome 支持 navigator.vibrate，直接用。
 *
 * iOS Safari 从不支持 navigator.vibrate，网页拿不到 Taptic Engine。
 * 下面那个 switch 开关是社区流传的偏方：iOS 的原生开关控件在切换时由系统
 * 发出触感，用一个屏幕外的开关代为触发。它依赖 Safari 的实现细节，随时
 * 可能失效，也可能在某些机型上根本不响——所以只当作锦上添花，失败了
 * 悄悄跳过，不影响任何功能。
 */

let iosSwitch: HTMLInputElement | null = null;

function ensureIosSwitch(): HTMLInputElement | null {
  if (iosSwitch) return iosSwitch;
  if (typeof document === "undefined") return null;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  input.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(input);

  iosSwitch = input;
  return input;
}

export function tapFeedback() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(8);
      return;
    }

    ensureIosSwitch()?.click();
  } catch {
    // 反馈失败无关紧要，不能因此打断切换
  }
}
