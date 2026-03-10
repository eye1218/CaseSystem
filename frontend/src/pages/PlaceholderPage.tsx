import { useLanguage } from "../contexts/LanguageContext";

interface PlaceholderPageProps {
  titleKey: string;
  description: string;
}

export default function PlaceholderPage({ titleKey, description }: PlaceholderPageProps) {
  const { t } = useLanguage();

  return (
    <div className="p-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">{t(titleKey)}</h2>
        <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p>
      </div>
    </div>
  );
}
