import type { KnowledgeArticleSummary } from "../types/knowledge";

export function createRelatedKnowledgeClickHandler(
  article: KnowledgeArticleSummary,
  {
    navigate,
    onSelectArticle
  }: {
    navigate: (path: string) => void;
    onSelectArticle?: ((article: KnowledgeArticleSummary) => void) | undefined;
  }
) {
  return () => {
    if (onSelectArticle) {
      onSelectArticle(article);
      return;
    }

    navigate(`/knowledge/${article.id}`);
  };
}
