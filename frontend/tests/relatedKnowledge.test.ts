import assert from "node:assert/strict";

import { mapKnowledgeDetailToDrawerArticle } from "../src/features/knowledge/utils.ts";
import type { KnowledgeArticleDetail, KnowledgeArticleSummary } from "../src/types/knowledge.ts";
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

const detail: KnowledgeArticleDetail = {
  ...article,
  content_markdown: "# 中文标题\n\nEnglish body",
  viewer_has_liked: false,
  permissions: {
    can_edit: true,
    can_delete: true,
    can_pin: true,
  },
};

const drawerArticle = mapKnowledgeDetailToDrawerArticle(detail);

assert.deepStrictEqual(drawerArticle, {
  id: "article-001",
  title: {
    zh: "SIEM 登录失败排查",
    en: "SIEM 登录失败排查",
  },
  summary: {
    zh: "用于验证工单详情页知识库交互的测试摘要。",
    en: "用于验证工单详情页知识库交互的测试摘要。",
  },
  tags: ["SIEM"],
  author: "Admin User",
  updated_at: "2026-03-13T09:00:00Z",
  version: "v1",
  likes: 3,
  content: {
    zh: "# 中文标题\n\nEnglish body",
    en: "# 中文标题\n\nEnglish body",
  },
});
