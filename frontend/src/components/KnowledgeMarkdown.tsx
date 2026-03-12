import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = { children?: ReactNode; className?: string; href?: string };

const markdownComponents = {
  h1: ({ children }: MarkdownProps) => (
    <h1 className="mt-0 mb-4 border-b border-slate-200 pb-2 text-lg text-slate-900 dark:border-slate-700 dark:text-white">
      {children}
    </h1>
  ),
  h2: ({ children }: MarkdownProps) => (
    <h2 className="mt-8 mb-3 flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
      <span className="inline-block h-4 w-1 rounded-full bg-blue-500" />
      {children}
    </h2>
  ),
  h3: ({ children }: MarkdownProps) => <h3 className="mt-5 mb-2 text-sm text-slate-700 dark:text-slate-200">{children}</h3>,
  h4: ({ children }: MarkdownProps) => (
    <h4 className="mt-4 mb-1.5 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">{children}</h4>
  ),
  p: ({ children }: MarkdownProps) => <p className="mb-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>,
  ul: ({ children }: MarkdownProps) => <ul className="mb-3 space-y-1.5 pl-5">{children}</ul>,
  ol: ({ children }: MarkdownProps) => <ol className="mb-3 list-decimal space-y-1.5 pl-5">{children}</ol>,
  li: ({ children }: MarkdownProps) => (
    <li className="list-disc text-sm leading-relaxed text-slate-700 marker:text-slate-400 dark:text-slate-300">{children}</li>
  ),
  pre: ({ children }: MarkdownProps) => <>{children}</>,
  code: ({ children, className }: MarkdownProps) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      const language = (className ?? "").replace("language-", "");
      return (
        <div className="my-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
            {language ? <span className="ml-2 text-[10px] uppercase text-slate-400">{language}</span> : null}
          </div>
          <pre className="m-0 overflow-x-auto bg-slate-950 p-4">
            <code className="whitespace-pre font-mono text-xs text-slate-200">{children}</code>
          </pre>
        </div>
      );
    }
    return (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-700 dark:text-slate-200">
        {children}
      </code>
    );
  },
  blockquote: ({ children }: MarkdownProps) => (
    <blockquote className="my-4 rounded-r-lg border-l-4 border-blue-400 bg-blue-50/50 py-3 pr-3 pl-4 dark:border-blue-600 dark:bg-blue-900/10">
      <div className="text-sm text-slate-600 dark:text-slate-400 [&>p]:mb-0">{children}</div>
    </blockquote>
  ),
  strong: ({ children }: MarkdownProps) => <strong className="text-slate-900 dark:text-white">{children}</strong>,
  em: ({ children }: MarkdownProps) => <em className="italic text-slate-600 dark:text-slate-400">{children}</em>,
  hr: () => <hr className="my-6 border-slate-200 dark:border-slate-700" />,
  table: ({ children }: MarkdownProps) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: MarkdownProps) => <thead className="bg-slate-100 dark:bg-slate-800">{children}</thead>,
  tbody: ({ children }: MarkdownProps) => <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{children}</tbody>,
  tr: ({ children }: MarkdownProps) => <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">{children}</tr>,
  th: ({ children }: MarkdownProps) => <th className="px-4 py-2.5 text-left text-slate-700 dark:text-slate-200">{children}</th>,
  td: ({ children }: MarkdownProps) => <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{children}</td>,
  a: ({ children, href }: MarkdownProps) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
      {children}
    </a>
  )
};

export default function KnowledgeMarkdown({ content }: { content: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents as never}>
      {content}
    </Markdown>
  );
}
