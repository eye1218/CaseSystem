import { apiDelete, apiDeleteJson, apiFetch, apiPatch, apiPost } from "./client";
import type {
  KnowledgeArticleDetail,
  KnowledgeArticleListResponse,
  KnowledgeArticlePayload
} from "../types/knowledge";

export async function listKnowledgeArticles(categoryId?: string) {
  const params = new URLSearchParams();
  if (categoryId && categoryId !== "all") {
    params.set("category_id", categoryId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<KnowledgeArticleListResponse>(`/api/v1/knowledge/articles${suffix}`);
}

export function getKnowledgeArticle(articleId: string) {
  return apiFetch<KnowledgeArticleDetail>(`/api/v1/knowledge/articles/${articleId}`);
}

export function createKnowledgeArticle(payload: KnowledgeArticlePayload) {
  return apiPost<KnowledgeArticleDetail>("/api/v1/knowledge/articles", payload);
}

export function updateKnowledgeArticle(articleId: string, payload: Partial<KnowledgeArticlePayload>) {
  return apiPatch<KnowledgeArticleDetail>(`/api/v1/knowledge/articles/${articleId}`, payload);
}

export function deleteKnowledgeArticle(articleId: string) {
  return apiDelete(`/api/v1/knowledge/articles/${articleId}`);
}

export function likeKnowledgeArticle(articleId: string) {
  return apiPost<KnowledgeArticleDetail>(`/api/v1/knowledge/articles/${articleId}/like`);
}

export function unlikeKnowledgeArticle(articleId: string) {
  return apiDeleteJson<KnowledgeArticleDetail>(`/api/v1/knowledge/articles/${articleId}/like`);
}

export function pinKnowledgeArticle(articleId: string) {
  return apiPost<KnowledgeArticleDetail>(`/api/v1/knowledge/articles/${articleId}/pin`);
}

export function unpinKnowledgeArticle(articleId: string) {
  return apiDeleteJson<KnowledgeArticleDetail>(`/api/v1/knowledge/articles/${articleId}/pin`);
}
