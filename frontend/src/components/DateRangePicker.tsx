interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}

export default function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        type="date"
        value={startDate}
        onChange={(event) => onChange(event.target.value, endDate)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
      <input
        type="date"
        value={endDate}
        onChange={(event) => onChange(startDate, event.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
    </div>
  );
}
