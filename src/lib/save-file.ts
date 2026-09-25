/**
 * Datei an den Nutzer geben (Web): auf dem Handy über „Teilen“ (z. B. in Dateien sichern,
 * WhatsApp), am PC als Download.
 */
export async function saveFile(blob: Blob, fileName: string): Promise<'shared' | 'downloaded' | 'failed'> {
  try {
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch (e) {
    // Teilen abgebrochen ist kein Fehler
    if ((e as Error)?.name === 'AbortError') return 'shared';
    return 'failed';
  }
}
