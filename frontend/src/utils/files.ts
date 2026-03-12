export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    const value = sizeBytes / (1024 * 1024);
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} MB`;
  }

  if (sizeBytes >= 1024) {
    const value = sizeBytes / 1024;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} KB`;
  }

  return `${sizeBytes} B`;
}
