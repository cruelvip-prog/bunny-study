import {
  AnswerKeyStatus,
  ExamQuestion,
  OptionLetter,
  QuestionStatus,
  TestConfig,
} from '../types/exam';
import { calculateExamResults } from './examLogic';

export interface AnswerReportQuestion {
  questionNumber: number;
  section: string;
  questionText: string | null;
  options: ExamQuestion['options'] | null;
  userAnswer: OptionLetter | null;
  answerText: string | null;
  correctAnswer: OptionLetter | null;
  correctness: 'Correct' | 'Incorrect' | 'Not evaluated';
  attemptStatus: string;
  reviewMarked: boolean;
  marks: number | null;
}

export interface AnswerReport {
  title: string;
  candidateName: string;
  rollNumber: string;
  sourceFileName: string | null;
  answerKeyStatus: AnswerKeyStatus;
  keyCoverage: number;
  totalQuestions: number;
  score: number | null;
  maxPossibleScore: number | null;
  scoreNotice: string;
  questions: AnswerReportQuestion[];
}

export interface AnswerReportTableRow {
  questionNumber: number;
  answerStatus: string;
}

export function formatAnswerReportStatus(
  question: Pick<AnswerReportQuestion, 'questionNumber' | 'userAnswer' | 'reviewMarked'>
): AnswerReportTableRow {
  const answerStatus = question.userAnswer
    ? question.reviewMarked
      ? `${question.userAnswer} — MARKED FOR REVIEW`
      : question.userAnswer
    : question.reviewMarked
      ? 'NOT ANSWERED — MARKED FOR REVIEW'
      : 'NOT ANSWERED';
  return { questionNumber: question.questionNumber, answerStatus };
}

export function paginateAnswerReportRows(
  rows: AnswerReportTableRow[],
  rowsPerPage: number
): AnswerReportTableRow[][] {
  if (!Number.isSafeInteger(rowsPerPage) || rowsPerPage < 1) {
    throw new Error('Rows per page must be a positive integer.');
  }
  const pages: AnswerReportTableRow[][] = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) {
    pages.push(rows.slice(index, index + rowsPerPage));
  }
  return pages;
}

export function buildAnswerReport(
  config: TestConfig,
  answers: Record<number, OptionLetter | null>,
  statuses: Record<number, QuestionStatus>,
  answerKey: Record<number, OptionLetter> | null,
  answerKeyStatus: AnswerKeyStatus,
  examQuestions: ExamQuestion[] = []
): AnswerReport {
  const results = calculateExamResults(config, answers, statuses, answerKey, answerKeyStatus);
  const questionLookup = new Map(examQuestions.map((question, index) => [index + 1, question]));
  const evaluated = results.questionResults.filter((result) => result.correctAnswer !== null).length;
  const scoreNotice = !results.hasAnswerKey
    ? 'Correctness and score could not be determined because no usable answer key was supplied.'
    : evaluated < config.totalQuestions
      ? `Partial answer key: ${evaluated} of ${config.totalQuestions} questions evaluated; other questions have no key answer.`
      : `Scoring uses a ${answerKeyStatus.replaceAll('-', ' ')} answer key with the simulator marking scheme (+4 / -1 / 0).`;

  return {
    title: config.title,
    candidateName: config.candidateName,
    rollNumber: config.rollNumber,
    sourceFileName: config.pdfFileName || null,
    answerKeyStatus,
    keyCoverage: evaluated,
    totalQuestions: config.totalQuestions,
    score: results.hasAnswerKey ? results.totalScore : null,
    maxPossibleScore: results.hasAnswerKey ? results.maxPossibleScore : null,
    scoreNotice,
    questions: results.questionResults.map((result) => {
      const sourceQuestion = questionLookup.get(result.questionNumber);
      const attemptStatus = result.userAnswer
        ? 'Attempted'
        : result.status === 'marked_for_review'
          ? 'Unanswered · Marked for review'
          : 'Unanswered';
      return {
        questionNumber: result.questionNumber,
        section: result.section,
        questionText: sourceQuestion?.questionEn || null,
        options: sourceQuestion?.options || null,
        userAnswer: result.userAnswer,
        answerText: result.userAnswer && sourceQuestion
          ? sourceQuestion.options[result.userAnswer].textEn
          : null,
        correctAnswer: result.correctAnswer,
        correctness: result.isCorrect === true
          ? 'Correct'
          : result.isCorrect === false
            ? 'Incorrect'
            : 'Not evaluated',
        attemptStatus,
        reviewMarked: result.status === 'marked_for_review' || result.status === 'answered_marked_for_review',
        marks: result.marks,
      };
    }),
  };
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Browser could not encode a report page.')), 'image/jpeg', 0.94);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

async function createReportPdf(report: AnswerReport): Promise<Blob> {
  const pageWidth = 612;
  const pageHeight = 792;
  const pixelScale = 2;
  const width = pageWidth * pixelScale;
  const height = pageHeight * pixelScale;
  const margin = 54 * pixelScale;
  const tableWidth = width - margin * 2;
  const questionColumnWidth = 84 * pixelScale;
  const answerColumnWidth = tableWidth - questionColumnWidth;
  const tableRowHeight = 34 * pixelScale;
  const pageCanvases: HTMLCanvasElement[] = [];
  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D = (() => {
    const initialContext = document.createElement('canvas').getContext('2d');
    if (!initialContext) throw new Error('This browser cannot render the PDF report.');
    return initialContext;
  })();
  let y = 0;

  const startPage = (firstPage: boolean) => {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    pageCanvases.push(canvas);
    const pageContext = canvas.getContext('2d');
    if (!pageContext) throw new Error('This browser cannot render the PDF report.');
    context = pageContext;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#0f172a';
    context.font = `${(firstPage ? 25 : 14) * pixelScale}px Arial, sans-serif`;
    context.fillText('Practice Exam Answer Report', margin, margin + (firstPage ? 27 : 16) * pixelScale);
    y = margin + (firstPage ? 48 : 30) * pixelScale;
    if (firstPage) {
      context.fillStyle = '#475569';
      context.font = `${11 * pixelScale}px Arial, sans-serif`;
      const metadata = `${report.title} · ${report.candidateName} · ${report.rollNumber}`;
      context.fillText(metadata.slice(0, 120), margin, y);
      y += 20 * pixelScale;
      context.fillText(`Source: ${report.sourceFileName || 'Question bank or simulator content'}`, margin, y);
      y += 20 * pixelScale;
      if (report.answerKeyStatus === 'none') {
        context.fillStyle = '#92400e';
        context.font = `bold ${11 * pixelScale}px Arial, sans-serif`;
        context.fillText('Answer key not supplied — correctness not evaluated.', margin, y);
        y += 24 * pixelScale;
      }
    }
    drawTableHeader();
  };

  const drawTableHeader = () => {
    context.fillStyle = '#1e293b';
    context.fillRect(margin, y, tableWidth, tableRowHeight);
    context.strokeStyle = '#334155';
    context.lineWidth = 1 * pixelScale;
    context.strokeRect(margin, y, questionColumnWidth, tableRowHeight);
    context.strokeRect(margin + questionColumnWidth, y, answerColumnWidth, tableRowHeight);
    context.fillStyle = '#ffffff';
    context.font = `bold ${11 * pixelScale}px Arial, sans-serif`;
    context.textBaseline = 'middle';
    context.fillText('QUE. NO.', margin + 10 * pixelScale, y + tableRowHeight / 2);
    context.fillText('ANSWER / STATUS', margin + questionColumnWidth + 12 * pixelScale, y + tableRowHeight / 2);
    y += tableRowHeight;
  };

  const drawRow = (row: AnswerReportTableRow, rowIndex: number) => {
    context.fillStyle = rowIndex % 2 === 0 ? '#f8fafc' : '#e2e8f0';
    context.fillRect(margin, y, tableWidth, tableRowHeight);
    context.strokeStyle = '#cbd5e1';
    context.lineWidth = 1 * pixelScale;
    context.strokeRect(margin, y, questionColumnWidth, tableRowHeight);
    context.strokeRect(margin + questionColumnWidth, y, answerColumnWidth, tableRowHeight);
    context.fillStyle = '#0f172a';
    context.font = `${12 * pixelScale}px Arial, sans-serif`;
    context.textBaseline = 'middle';
    context.fillText(String(row.questionNumber), margin + 12 * pixelScale, y + tableRowHeight / 2);
    context.fillText(row.answerStatus, margin + questionColumnWidth + 12 * pixelScale, y + tableRowHeight / 2);
    y += tableRowHeight;
  };

  const firstPageTableTop = margin + 48 * pixelScale + 40 * pixelScale +
    (report.answerKeyStatus === 'none' ? 24 * pixelScale : 0);
  const laterPageTableTop = margin + 30 * pixelScale;
  const rowsPerFirstPage = Math.max(1, Math.floor((height - margin - firstPageTableTop - tableRowHeight) / tableRowHeight));
  const rowsPerLaterPage = Math.max(1, Math.floor((height - margin - laterPageTableTop - tableRowHeight) / tableRowHeight));
  const rows = report.questions.map(formatAnswerReportStatus);
  const firstPageRows = rows.slice(0, rowsPerFirstPage);
  const remainingRows = rows.slice(rowsPerFirstPage);
  const laterPages = paginateAnswerReportRows(remainingRows, rowsPerLaterPage);
  const rowPages = [firstPageRows, ...laterPages];

  rowPages.forEach((pageRows, pageIndex) => {
    startPage(pageIndex === 0);
    pageRows.forEach((row, rowIndex) => drawRow(row, rowIndex));
    context.fillStyle = '#64748b';
    context.font = `${9 * pixelScale}px Arial, sans-serif`;
    context.textBaseline = 'alphabetic';
    context.fillText(`Page ${pageIndex + 1} of ${rowPages.length}`, width - margin - 90 * pixelScale, height - 18 * pixelScale);
  });

  if (rowPages.length === 0) {
    startPage(true);
    context.fillStyle = '#64748b';
    context.font = `${11 * pixelScale}px Arial, sans-serif`;
    context.textBaseline = 'alphabetic';
    context.fillText('No question responses are available for this report.', margin, y + 20 * pixelScale);
  }
  const pages = await Promise.all(pageCanvases.map(canvasJpeg));

  const encoder = new TextEncoder();
  const objects: Uint8Array[] = [];
  const imageObjectIds = pages.map((_, index) => 4 + index * 3);
  const pageObjectIds = pages.map((_, index) => 6 + index * 3);
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
  objects.push(encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.push(encoder.encode(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  objects.push(encoder.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  for (let index = 0; index < pages.length; index++) {
    const imageId = imageObjectIds[index];
    const contentId = imageId + 1;
    const jpeg = pages[index];
    const imageHeader = encoder.encode(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
    );
    objects.push(joinBytes([imageHeader, jpeg, encoder.encode('\nendstream')]));
    const content = encoder.encode(`q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im${index} Do Q`);
    objects.push(encoder.encode(`<< /Length ${content.length} >>\nstream\n${new TextDecoder().decode(content)}\nendstream`));
    objects.push(encoder.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
    ));
  }

  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let byteOffset = chunks[0].length;
  objects.forEach((object, index) => {
    const prefix = encoder.encode(`${index + 1} 0 obj\n`);
    const suffix = encoder.encode('\nendobj\n');
    offsets.push(byteOffset);
    chunks.push(prefix, object, suffix);
    byteOffset += prefix.length + object.length + suffix.length;
  });
  const xrefOffset = byteOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encoder.encode(xref));
  const bytes = joinBytes(chunks);
  const pdfData = new ArrayBuffer(bytes.length);
  new Uint8Array(pdfData).set(bytes);
  return new Blob([pdfData], { type: 'application/pdf' });
}

export async function downloadAnswerReportPdf(report: AnswerReport): Promise<void> {
  const pdf = await createReportPdf(report);
  const url = URL.createObjectURL(pdf);
  const safeTitle = report.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48) || 'practice-exam';
  const uniqueSuffix = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeTitle}-answer-report-${uniqueSuffix}.pdf`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
