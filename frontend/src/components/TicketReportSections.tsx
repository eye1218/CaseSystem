import { Download, Edit3, FileText, FileUp, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { createReport, deleteReport, replaceReportFile, updateReport } from "../api/reports";
import type { ReportTemplateSummary } from "../types/report";
import type { TicketDetail } from "../types/ticket";
import { formatApiDateTime } from "../utils/datetime";
import { formatFileSize } from "../utils/files";

interface ReportFormState {
  title: string;
  reportType: string;
  note: string;
  sourceTemplateId: string;
  file: File | null;
}

interface ReportEditState {
  title: string;
  reportType: string;
  note: string;
  sourceTemplateId: string;
}

interface TicketReportSectionsProps {
  currentRole?: string;
  detail: TicketDetail;
  language: "zh" | "en";
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
}

function emptyCreateForm(): ReportFormState {
  return {
    title: "",
    reportType: "",
    note: "",
    sourceTemplateId: "",
    file: null
  };
}

function buildTemplateOptions(templates: ReportTemplateSummary[], currentTemplateId?: string | null, currentTemplateName?: string | null) {
  const items = [...templates];
  if (currentTemplateId && !items.some((item) => item.id === currentTemplateId)) {
    items.push({
      id: currentTemplateId,
      name: currentTemplateName ?? currentTemplateId,
      description: null,
      ticket_category_id: "",
      status: "INACTIVE",
      original_filename: "",
      content_type: null,
      size_bytes: 0,
      download_path: "",
      created_at: "",
      updated_at: ""
    });
  }
  return items;
}

export default function TicketReportSections({
  currentRole,
  detail,
  language,
  onError,
  onRefresh
}: TicketReportSectionsProps) {
  const zh = language === "zh";
  const canManageReports = currentRole !== "CUSTOMER";
  const canViewTemplates = currentRole !== "CUSTOMER";

  const [saving, setSaving] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<ReportFormState>(emptyCreateForm());
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ReportEditState>({
    title: "",
    reportType: "",
    note: "",
    sourceTemplateId: ""
  });

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createForm.file) {
      onError(zh ? "请先选择报告文件。" : "Please select a report file.");
      return;
    }

    const formData = new FormData();
    formData.set("ticket_id", String(detail.ticket.id));
    formData.set("title", createForm.title);
    formData.set("report_type", createForm.reportType);
    formData.set("note", createForm.note);
    if (createForm.sourceTemplateId) {
      formData.set("source_template_id", createForm.sourceTemplateId);
    }
    formData.set("file", createForm.file);

    setSaving("create");
    onError("");
    try {
      await createReport(formData);
      setCreateForm(emptyCreateForm());
      await onRefresh();
    } catch (createError) {
      onError(createError instanceof Error ? createError.message : "Failed to upload report");
    } finally {
      setSaving(null);
    }
  }

  function startEdit(reportId: string) {
    const target = detail.reports.find((item) => item.id === reportId);
    if (!target) {
      return;
    }
    setEditingReportId((current) => (current === reportId ? null : reportId));
    setEditForm({
      title: target.title,
      reportType: target.report_type,
      note: target.note ?? "",
      sourceTemplateId: target.source_template?.id ?? ""
    });
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>, reportId: string) {
    event.preventDefault();
    setSaving(`update:${reportId}`);
    onError("");
    try {
      await updateReport(reportId, {
        title: editForm.title,
        report_type: editForm.reportType,
        note: editForm.note,
        source_template_id: editForm.sourceTemplateId || null
      });
      setEditingReportId(null);
      await onRefresh();
    } catch (updateError) {
      onError(updateError instanceof Error ? updateError.message : "Failed to update report");
    } finally {
      setSaving(null);
    }
  }

  async function handleReplaceFile(reportId: string, file: File | null) {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    setSaving(`replace:${reportId}`);
    onError("");
    try {
      await replaceReportFile(reportId, formData);
      await onRefresh();
    } catch (replaceError) {
      onError(replaceError instanceof Error ? replaceError.message : "Failed to replace report file");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(reportId: string, reportTitle: string) {
    const confirmed = window.confirm(
      zh ? `确认永久删除报告《${reportTitle}》吗？` : `Delete report "${reportTitle}" permanently?`
    );
    if (!confirmed) {
      return;
    }

    setSaving(`delete:${reportId}`);
    onError("");
    try {
      await deleteReport(reportId);
      if (editingReportId === reportId) {
        setEditingReportId(null);
      }
      await onRefresh();
    } catch (deleteError) {
      onError(deleteError instanceof Error ? deleteError.message : "Failed to delete report");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      {canViewTemplates ? (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {zh ? "报告模板下载" : "Report Templates"}
              </h2>
            </div>
            <span className="text-xs text-slate-400">{detail.report_templates.length}</span>
          </div>
          <div className="space-y-2.5 px-5 py-4">
            {detail.report_templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {zh ? "当前工单类型还没有可下载的模板。" : "No active template is available for this ticket category."}
              </div>
            ) : (
              detail.report_templates.map((template) => (
                <div key={template.id} className="rounded-2xl border border-slate-200 px-4 py-3.5 dark:border-slate-700">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{template.name}</div>
                      {template.description ? (
                        <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{template.description}</div>
                      ) : null}
                    </div>
                    <a
                      href={template.download_path}
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span>{template.original_filename}</span>
                    <span>{formatFileSize(template.size_bytes)}</span>
                    <span>{formatApiDateTime(template.updated_at, language)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {zh ? "已上传报告" : "Uploaded Reports"}
            </h2>
          </div>
          <span className="text-xs text-slate-400">{detail.reports.length}</span>
        </div>

        <div className="space-y-4 px-5 py-4">
          {canManageReports ? (
            <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="mb-3 flex items-center gap-2">
                <FileUp className="h-4 w-4 text-blue-500" />
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {zh ? "上传工单报告" : "Upload Report"}
                </div>
              </div>
              <div className="space-y-3">
                <label className="block text-sm text-slate-600 dark:text-slate-300">
                  <span className="mb-2 block">{zh ? "标题" : "Title"}</span>
                  <input
                    required
                    value={createForm.title}
                    onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                    className="ticket-input"
                  />
                </label>
                <label className="block text-sm text-slate-600 dark:text-slate-300">
                  <span className="mb-2 block">{zh ? "报告类型" : "Report Type"}</span>
                  <input
                    required
                    value={createForm.reportType}
                    onChange={(event) => setCreateForm((current) => ({ ...current, reportType: event.target.value }))}
                    className="ticket-input"
                  />
                </label>
                <label className="block text-sm text-slate-600 dark:text-slate-300">
                  <span className="mb-2 block">{zh ? "来源模板（可选）" : "Source Template (Optional)"}</span>
                  <select
                    value={createForm.sourceTemplateId}
                    onChange={(event) => setCreateForm((current) => ({ ...current, sourceTemplateId: event.target.value }))}
                    className="ticket-select"
                  >
                    <option value="">{zh ? "不关联模板" : "No template linked"}</option>
                    {detail.report_templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-600 dark:text-slate-300">
                  <span className="mb-2 block">{zh ? "报告文件" : "Report File"}</span>
                  <input
                    required
                    type="file"
                    onChange={(event) => setCreateForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
                    className="ticket-input file:mr-4 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:text-blue-600"
                  />
                </label>
                <label className="block text-sm text-slate-600 dark:text-slate-300">
                  <span className="mb-2 block">{zh ? "备注" : "Note"}</span>
                  <textarea
                    rows={3}
                    value={createForm.note}
                    onChange={(event) => setCreateForm((current) => ({ ...current, note: event.target.value }))}
                    className="ticket-input"
                  />
                </label>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={saving === "create"}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving === "create" ? (zh ? "上传中..." : "Uploading...") : zh ? "上传报告" : "Upload Report"}
                </button>
              </div>
            </form>
          ) : null}

          {detail.reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {zh ? "当前工单还没有已上传报告。" : "No uploaded reports for this ticket yet."}
            </div>
          ) : (
            detail.reports.map((report) => {
              const templateOptions = buildTemplateOptions(
                detail.report_templates,
                report.source_template?.id,
                report.source_template?.name
              );

              return (
                <div key={report.id} className="rounded-2xl border border-slate-200 px-4 py-3.5 dark:border-slate-700">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{report.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        <span>{report.report_type}</span>
                        <span>{report.original_filename}</span>
                        <span>{formatFileSize(report.size_bytes)}</span>
                      </div>
                    </div>
                    <a
                      href={report.download_path}
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span>{zh ? "上传人" : "Uploaded by"}: {report.uploaded_by}</span>
                    <span>{formatApiDateTime(report.updated_at, language)}</span>
                    {report.source_template ? <span>{zh ? "来源模板" : "Template"}: {report.source_template.name}</span> : null}
                  </div>

                  {report.note ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                      {report.note}
                    </div>
                  ) : null}

                  {canManageReports ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(report.id)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="h-4 w-4" />
                          {editingReportId === report.id ? (zh ? "收起编辑" : "Hide Editor") : zh ? "编辑元信息" : "Edit Metadata"}
                        </button>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
                          <RefreshCw className="h-4 w-4" />
                          {saving === `replace:${report.id}` ? (zh ? "替换中..." : "Replacing...") : zh ? "替换文件" : "Replace File"}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(event: ChangeEvent<HTMLInputElement>) => void handleReplaceFile(report.id, event.target.files?.[0] ?? null)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleDelete(report.id, report.title)}
                          disabled={saving === `delete:${report.id}`}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          {saving === `delete:${report.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          {zh ? "删除" : "Delete"}
                        </button>
                      </div>

                      {editingReportId === report.id ? (
                        <form onSubmit={(event) => void handleUpdate(event, report.id)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                          <div className="space-y-3">
                            <label className="block text-sm text-slate-600 dark:text-slate-300">
                              <span className="mb-2 block">{zh ? "标题" : "Title"}</span>
                              <input
                                value={editForm.title}
                                onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                                className="ticket-input"
                              />
                            </label>
                            <label className="block text-sm text-slate-600 dark:text-slate-300">
                              <span className="mb-2 block">{zh ? "报告类型" : "Report Type"}</span>
                              <input
                                value={editForm.reportType}
                                onChange={(event) => setEditForm((current) => ({ ...current, reportType: event.target.value }))}
                                className="ticket-input"
                              />
                            </label>
                            <label className="block text-sm text-slate-600 dark:text-slate-300">
                              <span className="mb-2 block">{zh ? "来源模板（可选）" : "Source Template (Optional)"}</span>
                              <select
                                value={editForm.sourceTemplateId}
                                onChange={(event) => setEditForm((current) => ({ ...current, sourceTemplateId: event.target.value }))}
                                className="ticket-select"
                              >
                                <option value="">{zh ? "不关联模板" : "No template linked"}</option>
                                {templateOptions.map((template) => (
                                  <option key={template.id} value={template.id}>
                                    {template.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block text-sm text-slate-600 dark:text-slate-300">
                              <span className="mb-2 block">{zh ? "备注" : "Note"}</span>
                              <textarea
                                rows={3}
                                value={editForm.note}
                                onChange={(event) => setEditForm((current) => ({ ...current, note: event.target.value }))}
                                className="ticket-input"
                              />
                            </label>
                          </div>

                          <div className="mt-4 flex justify-end">
                            <button
                              type="submit"
                              disabled={saving === `update:${report.id}`}
                              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                            >
                              {saving === `update:${report.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              {saving === `update:${report.id}` ? (zh ? "保存中..." : "Saving...") : zh ? "保存变更" : "Save Changes"}
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
