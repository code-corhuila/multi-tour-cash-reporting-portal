import { Injectable } from '@angular/core';
import { ReportData, ReportFile, ReportFormat, buildReportFile, buildReportPdf } from './report-files';

/**
 * Plan D-09 (pillars 2 and 9): the files of screen 16 and their names come from this service, so a test replaces it and
 * the container may provide its own. The default saves in the browser; the portal sends nothing anywhere (RN-CJ9).
 */
@Injectable({ providedIn: 'root', useFactory: () => new BrowserReportExporter() })
export abstract class ReportExporter {
  abstract export(format: ReportFormat, data: ReportData): void;
}

/** Saves a file through a temporary link to a Blob (no network, allowed by `default-src 'self'`). */
export function saveFile(file: ReportFile): void {
  const url = URL.createObjectURL(new Blob([file.content as BlobPart], { type: file.type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The browser exporter; if the PDF cannot be produced the CSV is saved instead (AC-RM.7). */
export class BrowserReportExporter extends ReportExporter {
  constructor(private readonly save: (file: ReportFile) => void = saveFile, private readonly pdf: (data: ReportData) => Uint8Array = buildReportPdf) { super(); }

  override export(format: ReportFormat, data: ReportData): void {
    let file: ReportFile | undefined;
    try { file = buildReportFile(format, data, this.pdf); } catch { file = undefined; }
    this.save(file ?? buildReportFile('csv', data));
  }
}
