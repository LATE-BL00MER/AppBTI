import { useEffect, useRef, useState, type RefObject } from 'react';

// 홈 카드 안의 예시를 몇 초마다 다음 것으로 넘긴다.
// 다음 경우에는 넘기지 않는다: 사용자가 멈춤을 눌렀거나 점을 직접 골랐을 때, 마우스를 올리거나 키보드로 카드 안에 들어왔을 때,
// 카드가 화면 밖에 있거나 탭이 가려졌을 때.
// 움직임 줄이기 설정이 켜져 있어도 넘기기는 하되(멈춤 버튼이 있다), 바뀔 때의 움직임 효과는 CSS에서 끈다.
export const CYCLE_MS = 3500;

export function useAutoCycle(count: number, { delay = 0 }: { delay?: number } = {}) {
  const ref = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [holding, setHolding] = useState(false);
  const [visible, setVisible] = useState(false);
  const running = count > 1 && !stopped && !holding && visible;

  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) { setVisible(true); return; }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.4 });
    io.observe(element);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    let timer = 0;
    // 카드마다 시작 시점을 조금씩 어긋나게 해 세 카드가 한꺼번에 바뀌지 않게 한다.
    const start = window.setTimeout(() => {
      const step = () => { if (!document.hidden) setIndex(current => (current + 1) % count); };
      step();
      timer = window.setInterval(step, CYCLE_MS);
    }, CYCLE_MS + delay);
    return () => { window.clearTimeout(start); window.clearInterval(timer); };
  }, [running, count, delay]);

  // 마우스·키보드가 카드 안에 있는 동안만 잠시 멈춘다.
  const hold = {
    onMouseEnter: () => setHolding(true),
    onMouseLeave: () => setHolding(false),
    onFocus: () => setHolding(true),
    onBlur: (event: React.FocusEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHolding(false); },
  };
  const choose = (next: number) => { setIndex(next); setStopped(true); };
  return { ref: ref as RefObject<HTMLElement>, index: count ? index % count : 0, choose, stopped, setStopped, running, hold };
}

export function CycleControls({ labels, index, choose, stopped, setStopped, name }: {
  labels: string[]; index: number; choose: (next: number) => void; stopped: boolean; setStopped: (stopped: boolean) => void; name: string;
}) {
  if (labels.length < 2) return null;
  return <div className="cycle-controls">
    <button type="button" className="cycle-toggle" onClick={() => setStopped(!stopped)}
      aria-label={stopped ? `${name} 예시 자동 넘김 다시 시작` : `${name} 예시 자동 넘김 멈추기`}>
      <span aria-hidden="true">{stopped ? '▶' : '❚❚'}</span>
    </button>
    <div className="cycle-dots" role="group" aria-label={`${name} 예시 고르기`}>
      {labels.map((label, i) => <button key={label + i} type="button" aria-current={i === index ? 'true' : undefined}
        aria-label={`${label} (${i + 1}/${labels.length})`} onClick={() => choose(i)} />)}
    </div>
  </div>;
}
