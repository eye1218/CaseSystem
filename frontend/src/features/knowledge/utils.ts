import type { NavigateFunction } from "react-router-dom";

import type { KnowledgeArticleDetail, KnowledgeArticleSummary } from "../../types/knowledge";
import type { TicketKnowledgeArticle } from "../../types/ticket";

export function createKnowledgeSelectionHandler({
  article,
  onSelectArticle,
  navigate,
}: {
  article: KnowledgeArticleSummary;
  onSelectArticle?: (article: KnowledgeArticleSummary) => void;
  navigate: NavigateFunction | ((href: string) => void);
}) {
  return () => {
    if (onSelectArticle) {
      onSelectArticle(article);
      return;
    }

    navigate(`/knowledge/${article.id}`);
  };
}

export function mapKnowledgeDetailToDrawerArticle(detail: KnowledgeArticleDetail): TicketKnowledgeArticle {
  return {
    id: detail.id,
    title: {
      zh: detail.title,
      en: detail.title,
    },
    summary: {
      zh: detail.excerpt,
      en: detail.excerpt,
    },
    tags: [detail.category_name],
    author: detail.author_name,
    updated_at: detail.updated_at,
    version: "v1",
    likes: detail.likes_count,
    content: {
      zh: detail.content_markdown,
      en: detail.content_markdown,
    },
  };
}
