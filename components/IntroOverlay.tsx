'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 진입 애니메이션 총 길이(ms).
 * PRD: 버튼 클릭부터 메인 화면이 완전히 안정될 때까지 2.4~3.0초에 걸쳐 진행한다.
 */
const EXIT_DURATION_MS = 2700;

/**
 * 전환 단계. boolean 여러 개 대신 이 값 하나로만 관리한다.
 * 각 레이어의 실제 움직임은 CSS animation-delay가 맡고, 이 상태는 같은 일정을
 * 컴포넌트 쪽에서도 알 수 있게 하는 단일 진행 표시다.
 */
export type IntroTransitionPhase =
  | 'idle'
  | 'charging'
  | 'expanding'
  | 'flowing'
  | 'dissolving'
  | 'revealing'
  | 'complete';

/**
 * 단계 일정. 타이머를 여기 한 곳에서만 만들어 어긋날 여지를 없앤다.
 * (charging은 클릭 즉시 시작하므로 0ms 항목을 따로 두지 않는다)
 */
const PHASE_SCHEDULE: ReadonlyArray<{ phase: IntroTransitionPhase; at: number }> = [
  { phase: 'expanding', at: 340 },
  { phase: 'flowing', at: 760 },
  { phase: 'dissolving', at: 1260 },
  { phase: 'revealing', at: 1900 },
  { phase: 'complete', at: EXIT_DURATION_MS },
];

/** 동작 줄이기 환경에서는 단순 fade만 하므로 훨씬 짧게 끝낸다 */
const REDUCED_EXIT_DURATION_MS = 220;
const REDUCED_PHASE_SCHEDULE: ReadonlyArray<{ phase: IntroTransitionPhase; at: number }> = [
  { phase: 'complete', at: REDUCED_EXIT_DURATION_MS },
];

type IntroState = 'visible' | 'exiting' | 'hidden';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 진입 인트로 (전체 화면 overlay).
 *
 * 별도 라우트가 아니라 메인 화면 위에 덮는 방식이라, 인트로가 보이는 동안에도
 * 기사 목록은 서버에서 이미 렌더링돼 뒤에 준비돼 있다 — 버튼을 눌러도 API를
 * 다시 부르지 않는다.
 *
 * 사용자 요청으로 "본 적 있음"을 기억하지 않는다. 링크로 들어오든 새로고침을
 * 하든 페이지가 새로 로드될 때마다 인트로를 띄운다. 서버·클라이언트가 항상
 * 같은 화면을 그리므로 hydration 차이도 생기지 않는다.
 */
export function IntroOverlay() {
  const [phase, setPhase] = useState<IntroTransitionPhase>('idle');
  const timersRef = useRef<number[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const state: IntroState =
    phase === 'complete' ? 'hidden' : phase === 'idle' ? 'visible' : 'exiting';

  // 인트로가 떠 있는 동안에는 뒤 화면이 스크롤되지 않게 막는다
  useEffect(() => {
    if (state !== 'visible' && state !== 'exiting') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [state]);

  useEffect(
    () => () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      document.documentElement.removeAttribute('data-intro-reveal');
    },
    [],
  );

  const handleStart = useCallback(() => {
    // 전환 중 중복 클릭을 막는다
    if (state !== 'visible') return;

    setPhase('charging');
    // 뒤에 있던 메인 화면이 확대에서 제자리로 돌아오며 드러나게 한다
    document.documentElement.setAttribute('data-intro-reveal', '1');

    const schedule = prefersReducedMotion() ? REDUCED_PHASE_SCHEDULE : PHASE_SCHEDULE;

    schedule.forEach(({ phase: next, at }) => {
      timersRef.current.push(
        window.setTimeout(() => {
          setPhase(next);
          if (next !== 'complete') return;

          document.documentElement.removeAttribute('data-intro-reveal');
          // 오버레이가 사라진 뒤 포커스를 본문으로 옮겨 키보드 흐름이 끊기지 않게 한다
          document.querySelector<HTMLElement>('[data-main-content]')?.focus();
        }, at),
      );
    });
  }, [state]);

  /**
   * 인트로가 떠 있는 동안 Tab이 뒤 화면으로 새지 않게 잡아 둔다.
   * 오버레이 안에서 초점을 받을 수 있는 것은 시작 버튼 하나뿐이라, 마운트 시점에
   * 포커스를 강제로 옮기지 않고 Tab을 눌렀을 때만 그 버튼으로 되돌린다.
   */
  useEffect(() => {
    if (state !== 'visible') return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      buttonRef.current?.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state]);

  // 전환이 시작되면 오버레이 안쪽 포커스를 놓아 준다 (버튼이 곧 사라진다)
  useEffect(() => {
    if (state !== 'exiting') return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && overlayRef.current?.contains(active)) active.blur();
  }, [state]);

  // 인트로를 끝냈으면 DOM에서 완전히 빼서 스크롤·클릭을 방해하지 않는다
  if (state === 'hidden') return null;

  const isExiting = state === 'exiting';

  return (
    <div
      ref={overlayRef}
      data-intro-overlay
      data-intro-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-label="기업 환경 모니터링 시작"
      className={`intro-background fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-6 ${
        isExiting ? 'animate-intro-overlay-out' : 'animate-intro-bg-in'
      }`}
    >
      {/* 배경: 천천히 출렁이는 컬러 웨이브 3층 + 격자 + 중앙 빛 확산 */}
      <div aria-hidden="true" className="intro-wave intro-wave--1" />
      <div aria-hidden="true" className="intro-wave intro-wave--2" />
      <div aria-hidden="true" className="intro-wave intro-wave--3" />
      <div aria-hidden="true" className="intro-grid" />
      <div aria-hidden="true" className="intro-glow" />

      {/* 전환 레이어. 클릭한 뒤에만 DOM에 올라오고, 끝나면 오버레이째 제거된다 */}
      {isExiting && (
        <>
          <span aria-hidden="true" className="intro-charge" />
          <span aria-hidden="true" className="intro-expand" />
          <div aria-hidden="true" className="intro-sweep intro-sweep--one" />
          <div aria-hidden="true" className="intro-sweep intro-sweep--two" />
          <div aria-hidden="true" className="intro-bloom" />
          <div aria-hidden="true" className="intro-sweep intro-sweep--three" />
        </>
      )}

      <div
        className={`relative flex flex-col items-center text-center ${
          isExiting ? 'animate-intro-content-out' : ''
        }`}
      >
        <h1 className="animate-intro-title text-[28px] font-semibold tracking-tight text-[#202124] sm:text-4xl">
          기업{' '}
          {/* 핵심 단어에만 그라데이션을 준다 — 제목 전체에 쓰면 가독성이 떨어진다 */}
          <span className="bg-gradient-to-r from-[#1A73E8] via-[#4F46E5] to-[#7C3AED] bg-clip-text text-transparent">
            환경 모니터링
          </span>
        </h1>

        <p className="animate-intro-desc mt-4 max-w-md text-[15px] leading-7 text-[#5F6368] sm:text-base">
          산업 현장의 규제와 애로를
          <br />
          가치 있는 정보로 연결합니다.
        </p>

        <button
          ref={buttonRef}
          type="button"
          onClick={handleStart}
          disabled={isExiting}
          className={`intro-start-button animate-intro-button mt-9 h-[54px] rounded-2xl px-8 text-[15px] font-medium text-white disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2 ${
            isExiting ? 'is-charging' : ''
          }`}
        >
          모니터링 시작
        </button>
      </div>
    </div>
  );
}
