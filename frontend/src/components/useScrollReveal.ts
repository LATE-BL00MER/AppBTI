import { useEffect } from 'react';

// 페이지에 들어오면 첫 화면 블록이 차례로 올라오고, 스크롤하면 아래 블록이 화면에 들어올 때 나타난다.
// 데이터가 늦게 그려지는 화면도 있어서 새로 생긴 블록까지 따라가 관찰한다.
// 설문 화면에는 적용하지 않는다(문항이 스크롤 전까지 숨지 않게 survey.css의 진입 애니메이션을 쓴다). 움직임 줄이기 설정이 켜져 있으면 CSS에서 이동 없이 서서히 나타나게만 한다.
// 카드를 여러 장 담는 큰 묶음(#findings, .home-findings)은 통째로 숨기지 않고 안의 카드가 하나씩 나타나게 한다.
const TARGETS = 'main section:not(#findings):not(.home-findings), main .insight-card, main .page-heading';
const STEP_MS = 110;
// 블록 윗부분이 화면 아래쪽 88% 지점을 넘으면 나타낸다.
const TRIGGER = 0.88;
// 등장 지연(최대 440ms)+차트 지연(250ms)+차트 시간(1.4s)이 끝난 뒤
const SETTLE_MS = 2500;

export function useScrollReveal(key: string, enabled = true) {
  useEffect(() => {
    const root = document.getElementById('main');
    if (!enabled || !root) return;

    const seen = new WeakSet<Element>();
    const pending = new Set<HTMLElement>();
    let timer = 0;

    // 화면에 들어왔거나 이미 지나친 블록을 모두 나타낸다(링크로 한 번에 건너뛴 경우 포함).
    const check = () => {
      timer = 0;
      let order = 0;
      for (const element of pending) {
        if (element.getBoundingClientRect().top > window.innerHeight * TRIGGER) continue;
        element.style.setProperty('--reveal-delay', `${Math.min(order++, 4) * STEP_MS}ms`);
        element.classList.add('is-visible');
        // 첫 등장이 끝나면 이후 다시 그려지는 차트는 기다리지 않고 바로 차오른다(design.css --chart-delay).
        window.setTimeout(() => element.classList.add('reveal-settled'), SETTLE_MS);
        pending.delete(element);
      }
    };
    // requestAnimationFrame은 탭이 가려지면 멈추므로 짧은 타이머로 확인한다.
    const schedule = () => { if (!timer) timer = window.setTimeout(check, 16); };

    const register = () => {
      const fresh = [...root.querySelectorAll<HTMLElement>(TARGETS)].filter(element => !seen.has(element)
        // 이미 나타난 블록 안에 새로 그려진 블록은 따로 숨기지 않는다.
        && !element.parentElement?.closest('.reveal'));
      if (!fresh.length) return;
      fresh.forEach(element => { seen.add(element); element.classList.add('reveal'); pending.add(element); });
      // 숨긴 상태가 한 번 그려진 뒤에 확인해야 첫 화면 블록에도 전환 효과가 보인다.
      window.setTimeout(schedule, 50);
    };

    register();
    // 스크롤 이벤트 없이 위치가 바뀌는 경우(새로고침 뒤 위치 복원, 화면 회전 등)를 위해 화면 진입도 따로 감지한다.
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(schedule) : null;
    const observe = () => pending.forEach(element => io?.observe(element));
    observe();
    const mo = new MutationObserver(() => { register(); observe(); });
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      mo.disconnect();
      io?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.clearTimeout(timer);
      root.querySelectorAll('.reveal').forEach(element => element.classList.add('is-visible'));
    };
  }, [key, enabled]);
}
