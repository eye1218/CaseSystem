import assert from "node:assert/strict";

import type { KnowledgeArticleSummary } from "../src/types/knowledge.ts";
import { createRelatedKnowledgeClickHandler } from "../src/utils/relatedKnowledge.ts";

const article: KnowledgeArticleSummary = {
  id: "article-001",
  title: "SIEM 登录失败排查",
  category_id: "siem",
  category_name: "SIEM",
  excerpt: "用于验证工单详情页知识库交互的测试摘要。",
  author_name: "Admin User",
  updated_at: "2026-03-13T09:00:00Z",
  likes_count: 3,
  is_pinned: true,
};

{
  const selected: KnowledgeArticleSummary[] = [];
  const navigations: string[] = [];

  const handleClick = createRelatedKnowledgeClickHandler(article, {
    navigate: (path) => navigations.push(path),
    onSelectArticle: (item) => selected.push(item),
  });

  handleClick();

  assert.deepStrictEqual(selected, [article]);
  assert.deepStrictEqual(navigations, []);
}

{
  const selected: KnowledgeArticleSummary[] = [];
  const navigations: string[] = [];

  const handleClick = createRelatedKnowledgeClickHandler(article, {
    navigate: (path) => navigations.push(path),
    onSelectArticle: undefined,
  });

  handleClick();

  assert.deepStrictEqual(selected, []);
  assert.deepStrictEqual(navigations, ["/knowledge/article-001"]);
}
