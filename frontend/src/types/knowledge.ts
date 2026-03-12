export interface KnowledgePermissions {
  can_edit: boolean;
  can_delete: boolean;
  can_pin: boolean;
}

export interface KnowledgeArticleSummary {
  id: string;
  title: string;
  category_id: string;
  category_name: string;
  excerpt: string;
  author_name: string;
  updated_at: string;
  likes_count: number;
  is_pinned: boolean;
}

export interface KnowledgeArticleDetail extends KnowledgeArticleSummary {
  content_markdown: string;
  viewer_has_liked: boolean;
  permissions: KnowledgePermissions;
}

export interface KnowledgeArticleListResponse {
  items: KnowledgeArticleSummary[];
  total_count: number;
}

export interface KnowledgeArticlePayload {
  title: string;
  category_id: string;
  content_markdown: string;
}
