import { classifyArticle } from '@/lib/classification';
import { publisherDomain, publisherName } from '@/lib/publishers';
import { explainRelevance } from '@/lib/relevance';
import type { Article, ArticleGroup, EnrichedArticle, EnrichedGroup } from '@/types/article';

/**
 * 조회한 기사에 화면용 파생 정보를 붙인다.
 *
 * 분류·점수 근거·언론사명·검색 텍스트를 **여기서 한 번만** 계산한다. 카드마다
 * 렌더링할 때 다시 계산하면 필터를 한 번 바꿀 때마다 30장 × 여러 함수가 다시
 * 돌기 때문이다. DB에 새 컬럼을 만들지 않고, AI도 부르지 않는다.
 */
export function enrichArticle(article: Article): EnrichedArticle {
  const summaryText = (article.summary ?? []).join(' ');
  const expandedText = (article.expandedSummary ?? []).join(' ');
  const classification = classifyArticle(article.title, `${summaryText} ${expandedText}`);

  return {
    ...article,
    publisher: publisherName(article.press),
    domain: publisherDomain(article.press),
    classification,
    // 저장된 발췌문이 없으므로 요약을 본문 자리에 넣는다 (calculateRelevanceScore와 같은 사용법)
    scoreReasons: explainRelevance(article.title, summaryText, article.industries),
    searchText:
      `${article.title} ${summaryText} ${publisherName(article.press)} ${article.press} ` +
      `${article.industries.join(' ')} ${classification.agencies.join(' ')} ` +
      `${classification.associations.join(' ')} ${classification.companies.join(' ')}`.toLowerCase(),
    expandedSearchText: expandedText.toLowerCase(),
  };
}

export function enrichGroup(group: ArticleGroup): EnrichedGroup {
  return {
    representative: enrichArticle(group.representative),
    related: group.related.map(enrichArticle),
  };
}

export function enrichGroups(groups: ArticleGroup[]): EnrichedGroup[] {
  return groups.map(enrichGroup);
}
