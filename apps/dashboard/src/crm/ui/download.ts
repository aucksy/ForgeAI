/**
 * Save text as a file from the browser.
 *
 * Split out of the screens because it is the only genuinely non-pure part of the
 * export path — building the CSV itself is `logic/csv.ts` and fully tested. This
 * file exists so a screen never has to touch `document` directly.
 */

export function downloadTextFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // Firefox will not follow a click on an element that is not in the document.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoking synchronously cancels the download in some browsers, which fails
  // silently and looks to the owner like the button does nothing.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCsv(filename: string, contents: string): void {
  downloadTextFile(filename, contents, 'text/csv;charset=utf-8;');
}
