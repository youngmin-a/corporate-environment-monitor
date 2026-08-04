'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** 같은 브라우저 세션에서 인트로를 다시 띄우지 않기 위한 표시 */
const INTRO_STORAGE_KEY = 'business-monitor-intro-seen';

/**
 * 진입 애니메이션 총 길이(ms).
 * 충격파 → 웨이브 1·2 → 컬러 스윕 → 메인 공개까지 포함한다.
 * PRD: 버튼 클릭부터 메인 화면이 완전히 보일 때까지 1.0~1.4초 안에 끝낸다.
 *
 * 하위 단계는 별도 타이머 없이 CSS animation-delay로 순서를 잡는다 —
 * 타이머를 여러 개 두면 어긋날 여지만 늘고, 실제로 필요한 것은 "언제 끝나는가"뿐이다.
 */
const EXIT_DURATION_MS = 1250;

/**
 * 전환 단계. 실제 순서 제어는 CSS가 하고, 컴포넌트는 이 흐름을 하나의 상태로만 들고 있는다.
 *   impact(0ms) → wave-one(60ms) → wave-two(170ms) → sweep(300ms) → reveal(620ms)
 */
export type IntroTransitionPhase =
  | 'idle'
  | 'impact'
  | 'wave-one'
  | 'wave-two'
  | 'reveal'
  | 'complete';

/** 동작 줄이기 환경에서는 단순 fade만 하므로 훨씬 짧게 끝낸다 */
const REDUCED_EXIT_DURATION_MS = 180;

type IntroState = 'checking' | 'visible' | 'exiting' | 'hidden';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 세션 동안 값이 바뀌지 않으므로 구독은 빈 함수로 둔다 */
const subscribeToNothing = () => () => {};

function readIntroSeen(): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_STORAGE_KEY) !== null;
  } catch {
    // 시크릿 모드 등으로 sessionStorage를 못 쓰면 인트로를 한 번 보여준다
    return false;
  }
}

/**
 * 서버에서는 sessionStorage를 볼 수 없으므로 "아직 안 봤다"로 그린다.
 * 이미 본 세션이라면 layout.tsx의 인라인 스크립트가 첫 페인트 전에 CSS로 가리므로
 * 화면에는 비치지 않는다.
 */
const readIntroSeenOnServer = () => false;

/**
 * 첫 진입 인트로 (전체 화면 overlay).
 *
 * 별도 라우트가 아니라 메인 화면 위에 덮는 방식이라, 인트로가 보이는 동안에도
 * 기사 목록은 서버에서 이미 렌더링돼 뒤에 준비돼 있다 — 버튼을 눌러도 API를
 * 다시 부르지 않는다.
 *
 * 첫 페인트 전에 layout.tsx의 인라인 스크립트가 sessionStorage를 확인해
 * `data-intro-seen`을 심어 두므로, 이미 본 세션에서는 이 오버레이가 화면에
 * 잠깐이라도 비치지 않는다(flash 방지).
 */
export function IntroOverlay() {
  const introSeen = useSyncExternalStore(
    subscribeToNothing,
    readIntroSeen,
    readIntroSeenOnServer,
  );
  const [phase, setPhase] = useState<'idle' | 'exiting' | 'done'>('idle');
  const timersRef = useRef<number[]>([]);

  // 클릭 후에는 introSeen이 true로 바뀌어도 전환 애니메이션을 끝까지 보여준다
  const state: IntroState =
    phase === 'done' || (introSeen && phase === 'idle')
      ? 'hidden'
      : phase === 'exiting'
        ? 'exiting'
        : 'visible';

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

    try {
      window.sessionStorage.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      // 저장에 실패해도 이번 진입은 그대로 진행한다
    }

    setPhase('exiting');
    // 뒤에 있던 메인 화면이 확대에서 제자리로 돌아오며 드러나게 한다
    document.documentElement.setAttribute('data-intro-reveal', '1');

    const duration = prefersReducedMotion() ? REDUCED_EXIT_DURATION_MS : EXIT_DURATION_MS;

    const hideTimer = window.setTimeout(() => {
      setPhase('done');
      document.documentElement.removeAttribute('data-intro-reveal');
      // 오버레이가 사라진 뒤 포커스를 본문으로 옮겨 키보드 흐름이 끊기지 않게 한다
      document.querySelector<HTMLElement>('[data-main-content]')?.focus();
    }, duration);

    timersRef.current.push(hideTimer);
  }, [state]);

  // 인트로를 끝냈으면 DOM에서 완전히 빼서 스크롤·클릭을 방해하지 않는다
  if (state === 'hidden') return null;

  const isExiting = state === 'exiting';

  return (
    <div
      data-intro-overlay
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
          <span aria-hidden="true" className="intro-impact" />
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
          type="button"
          onClick={handleStart}
          disabled={isExiting}
          className="intro-start-button animate-intro-button mt-9 h-[54px] rounded-2xl px-8 text-[15px] font-medium text-white disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2"
        >
          모니터링 시작
        </button>
      </div>
    </div>
  );
}
