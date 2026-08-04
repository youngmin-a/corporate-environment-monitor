'use client';

import { useSyncExternalStore } from 'react';

/**
 * 개인 업무 상태 저장소.
 *
 * 이 서비스는 로그인이 없다(PRD 7번). 읽음·검토 상태·저장·메모·보고서 목록은
 * 서버에 두지 않고 **이 브라우저에만** 남긴다. 다른 기기·다른 브라우저에서는
 * 보이지 않으며, 화면에도 그렇게 안내한다.
 *
 * 메모를 포함한 어떤 값도 서버·외부 API로 보내지 않는다.
 */

const STORAGE_KEY = 'business-monitor-workspace-v1';

export type ReviewStatus =
  | 'unread'
  | 'reviewing'
  | 'important'
  | 'included-in-report'
  | 'hold'
  | 'completed';

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  unread: '미검토',
  reviewing: '검토 중',
  important: '중요',
  'included-in-report': '보고서 반영',
  hold: '보류',
  completed: '검토 완료',
};

export const REVIEW_STATUS_ORDER: ReviewStatus[] = [
  'unread',
  'reviewing',
  'important',
  'included-in-report',
  'hold',
  'completed',
];

export type FeedbackReason =
  | 'not-relevant'
  | 'wrong-industry'
  | 'duplicate'
  | 'bad-summary'
  | 'bad-source';

export const FEEDBACK_LABELS: Record<FeedbackReason, string> = {
  'not-relevant': '관련 없음',
  'wrong-industry': '산업 분류 오류',
  duplicate: '중복 기사',
  'bad-summary': '요약 오류',
  'bad-source': '출처 오류',
};

export type ViewMode = 'card' | 'compact' | 'cluster';

export type SavedView = {
  id: string;
  name: string;
  /** DashboardFilters를 그대로 담는다. 타입은 lib/dashboard.ts가 정의한다 */
  filters: unknown;
  createdAt: string;
};

export type PersonalState = {
  version: 1;
  read: Record<string, string>;
  review: Record<string, ReviewStatus>;
  bookmarks: Record<string, string>;
  memos: Record<string, { text: string; updatedAt: string }>;
  report: string[];
  hidden: Record<string, { reason: FeedbackReason; at: string }>;
  savedViews: SavedView[];
  recentSearches: string[];
  viewMode: ViewMode;
  /** 지금 방문 시각 */
  lastVisitAt: string | null;
  /** 직전 방문 시각. "마지막 방문 이후 신규" 판정 기준이다 */
  previousVisitAt: string | null;
};

export const EMPTY_STATE: PersonalState = {
  version: 1,
  read: {},
  review: {},
  bookmarks: {},
  memos: {},
  report: [],
  hidden: {},
  savedViews: [],
  recentSearches: [],
  viewMode: 'card',
  lastVisitAt: null,
  previousVisitAt: null,
};

const MAX_RECENT_SEARCHES = 5;

let cached: PersonalState = EMPTY_STATE;
let loaded = false;
const listeners = new Set<() => void>();

function read(): PersonalState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<PersonalState>;
    if (parsed.version !== 1) return EMPTY_STATE;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    // 시크릿 모드 등으로 localStorage를 못 쓰면 이번 세션은 기본값으로 둔다
    return EMPTY_STATE;
  }
}

function write(next: PersonalState) {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패해도 화면 상태는 유지한다
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PersonalState {
  if (!loaded) {
    cached = read();
    loaded = true;
  }
  return cached;
}

/**
 * 서버 렌더링에는 저장된 값이 없다. hydration 직후 한 번 더 그려지며 실제 값으로
 * 바뀌므로, 여기서 다른 값을 돌려주면 안 된다(불일치 경고가 난다).
 */
const getServerSnapshot = (): PersonalState => EMPTY_STATE;

export function usePersonalState(): PersonalState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function update(mutate: (state: PersonalState) => PersonalState) {
  write(mutate(getSnapshot()));
}

const now = () => new Date().toISOString();

export const personalActions = {
  markRead(url: string) {
    if (getSnapshot().read[url]) return;
    update((state) => ({ ...state, read: { ...state.read, [url]: now() } }));
  },

  markAllRead(urls: string[]) {
    update((state) => {
      const read = { ...state.read };
      const at = now();
      urls.forEach((url) => {
        read[url] = read[url] ?? at;
      });
      return { ...state, read };
    });
  },

  setReview(url: string, status: ReviewStatus) {
    update((state) => {
      const review = { ...state.review };
      if (status === 'unread') delete review[url];
      else review[url] = status;
      return { ...state, review };
    });
  },

  toggleBookmark(url: string) {
    update((state) => {
      const bookmarks = { ...state.bookmarks };
      if (bookmarks[url]) delete bookmarks[url];
      else bookmarks[url] = now();
      return { ...state, bookmarks };
    });
  },

  setMemo(url: string, text: string) {
    update((state) => {
      const memos = { ...state.memos };
      if (text.trim().length === 0) delete memos[url];
      else memos[url] = { text, updatedAt: now() };
      return { ...state, memos };
    });
  },

  toggleReport(url: string) {
    update((state) => {
      const inReport = state.report.includes(url);
      return {
        ...state,
        report: inReport ? state.report.filter((item) => item !== url) : [...state.report, url],
      };
    });
  },

  addToReport(urls: string[]) {
    update((state) => {
      const merged = [...state.report];
      urls.forEach((url) => {
        if (!merged.includes(url)) merged.push(url);
      });
      return { ...state, report: merged };
    });
  },

  setReportOrder(urls: string[]) {
    update((state) => ({ ...state, report: urls }));
  },

  clearReport() {
    update((state) => ({ ...state, report: [] }));
  },

  hide(url: string, reason: FeedbackReason) {
    update((state) => ({ ...state, hidden: { ...state.hidden, [url]: { reason, at: now() } } }));
  },

  unhide(url: string) {
    update((state) => {
      const hidden = { ...state.hidden };
      delete hidden[url];
      return { ...state, hidden };
    });
  },

  saveView(name: string, filters: unknown) {
    update((state) => ({
      ...state,
      savedViews: [
        ...state.savedViews.filter((view) => view.name !== name),
        { id: `${Date.now()}`, name, filters, createdAt: now() },
      ],
    }));
  },

  deleteView(id: string) {
    update((state) => ({
      ...state,
      savedViews: state.savedViews.filter((view) => view.id !== id),
    }));
  },

  pushRecentSearch(term: string) {
    const trimmed = term.trim();
    if (trimmed.length === 0) return;
    update((state) => ({
      ...state,
      recentSearches: [trimmed, ...state.recentSearches.filter((item) => item !== trimmed)].slice(
        0,
        MAX_RECENT_SEARCHES,
      ),
    }));
  },

  removeRecentSearch(term: string) {
    update((state) => ({
      ...state,
      recentSearches: state.recentSearches.filter((item) => item !== term),
    }));
  },

  clearRecentSearches() {
    update((state) => ({ ...state, recentSearches: [] }));
  },

  setViewMode(viewMode: ViewMode) {
    update((state) => ({ ...state, viewMode }));
  },

  /** 페이지를 열 때 한 번 호출한다. 직전 방문 시각을 신규 판정용으로 남긴다 */
  touchVisit() {
    const state = getSnapshot();
    const at = now();
    // 같은 방문 안에서 여러 번 불려도 previousVisitAt이 밀리지 않게 30분 간격을 둔다
    const recent =
      state.lastVisitAt && Date.now() - new Date(state.lastVisitAt).getTime() < 30 * 60 * 1000;
    write({
      ...state,
      previousVisitAt: recent ? state.previousVisitAt : state.lastVisitAt,
      lastVisitAt: at,
    });
  },

  resetAll() {
    write({ ...EMPTY_STATE, lastVisitAt: now() });
  },
};

export function reviewStatusOf(state: PersonalState, url: string): ReviewStatus {
  return state.review[url] ?? 'unread';
}
