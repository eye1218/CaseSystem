import { Clock3, Download, FileText, FileUp, Loader2, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { createReport } from "../api/reports";
import type { ReportSummary, ReportTemplateSummary } from "../types/report";
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

function ReportListItem({
  report,
  zh,
  language,
}: {
  report: ReportSummary;
  zh: boolean;
  language: "zh" | "en";
}) {
  return (
    <div className="group flex items-start gap-2.5 rounded-lg border border-slate-100 px-3 py-2.5 text-left transition-all hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-blue-900/10">
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 line-clamp-2 text-xs leading-snug text-slate-700 transition-colors group-hover:text-blue-700 dark:text-slate-300 dark:group-hover:text-blue-300">
          {report.title}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex min-w-0 items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
            <User className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">{report.uploaded_by}</span>
          </span>
          <span className="flex min-w-0 items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
            <Clock3 className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">{formatApiDateTime(report.created_at, language)}</span>
          </span>
        </div>
      </div>
      <a
        href={report.download_path}
        download
        className="mt-1 inline-flex h-7 min-w-fit flex-shrink-0 items-center justify-center gap-1 rounded-md border border-blue-200 px-2.5 text-[11px] font-medium leading-none whitespace-nowrap text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-100/80 dark:border-blue-800 dark:text-blue-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/40"
      >
        <Download className="h-3 w-3" />
        {zh ? "下载" : "Download"}
      </a>
    </div>
  );
}

function ReportUploadModal({
  open,
  onClose,
  onSubmit,
  createForm,
  setCreateForm,
  templates,
  saving,
  zh,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  createForm: ReportFormState;
  setCreateForm: React.Dispatch<React.SetStateAction<ReportFormState>>;
  templates: ReportTemplateSummary[];
  saving: string | null;
  zh: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-white">
              {zh ? "上传工单报告" : "Upload Ticket Report"}
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {zh ? "填写报告元信息并选择文件后完成上传。" : "Fill in the report details and choose a file to upload."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
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
            <label className="block text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
              <span className="mb-2 block">{zh ? "来源模板（可选）" : "Source Template (Optional)"}</span>
              <select
                value={createForm.sourceTemplateId}
                onChange={(event) => setCreateForm((current) => ({ ...current, sourceTemplateId: event.target.value }))}
                className="ticket-select"
              >
                <option value="">{zh ? "不关联模板" : "No template linked"}</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
              <span className="mb-2 block">{zh ? "报告文件" : "Report File"}</span>
              <input
                required
                type="file"
                onChange={(event) => setCreateForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
                className="ticket-input file:mr-4 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:text-blue-600"
              />
            </label>
            <label className="block text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
              <span className="mb-2 block">{zh ? "备注" : "Note"}</span>
              <textarea
                rows={4}
                value={createForm.note}
                onChange={(event) => setCreateForm((current) => ({ ...current, note: event.target.value }))}
                className="ticket-input"
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={saving === "create"}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {saving === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {saving === "create" ? (zh ? "上传中..." : "Uploading...") : zh ? "确认上传" : "Upload Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<ReportFormState>(emptyCreateForm());

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
      setShowCreateModal(false);
      await onRefresh();
    } catch (createError) {
      onError(createError instanceof Error ? createError.message : "Failed to upload report");
    } finally {
      setSaving(null);
    }
  }

  function closeCreateModal() {
    setShowCreateModal(false);
    setCreateForm(emptyCreateForm());
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
          {detail.reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {zh ? "当前工单还没有已上传报告。" : "No uploaded reports for this ticket yet."}
            </div>
          ) : (
            <div className="space-y-1.5">
              {detail.reports.map((report) => (
                <ReportListItem key={report.id} report={report} zh={zh} language={language} />
              ))}
            </div>
          )}

          {canManageReports ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {zh ? "新增工单报告" : "Add Another Report"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {zh ? "点击按钮后在弹窗中填写表单并选择文件上传。" : "Open the dialog to fill in the form and upload a file."}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onError("");
                    setShowCreateModal(true);
                  }}
                  className="inline-flex h-8 min-w-fit flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 text-xs font-medium leading-none text-white transition-colors hover:bg-blue-700"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  {zh ? "上传报告" : "Upload Report"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ReportUploadModal
        open={canManageReports && showCreateModal}
        onClose={closeCreateModal}
        onSubmit={handleCreate}
        createForm={createForm}
        setCreateForm={setCreateForm}
        templates={detail.report_templates}
        saving={saving}
        zh={zh}
      />
    </>
  );
}
