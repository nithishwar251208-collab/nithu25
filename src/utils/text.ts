import { createHash } from 'node:crypto';
import type { BloomLevel, Difficulty } from '../types/index.ts';

// Text Normalization (removes punctuation, lowercases, trims excessive spaces)
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // replace symbols/punct with space
    .replace(/\s+/g, ' ')      // collapse whitespace
    .trim();
}

// Compute deterministic SHA256 hash of normalized text for exact duplicate detection
export function computeTextHash(text: string): string {
  const normalized = normalizeText(text);
  return createHash('sha256').update(normalized).digest('hex');
}

// Jaccard similarity for token overlap
export function jaccardSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(normalizeText(textA).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeText(textB).split(' ').filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionCount++;
    }
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  return intersectionCount / unionSize;
}

// Levenshtein distance for string edit distance
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[m][n];
}

// Normalized Levenshtein ratio (0.0 to 1.0)
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / maxLen;
}

// Classify Bloom's Taxonomy based on action verbs
export function inferBloomLevel(questionText: string): BloomLevel {
  const lower = questionText.toLowerCase();

  // Create keywords
  if (/\b(design|construct|formulate|generate|compose|create|plan|develop)\b/.test(lower)) {
    return 'CREATE';
  }
  // Evaluate keywords
  if (/\b(evaluate|judge|critique|justify|validate|assess|rate|compare and contrast)\b/.test(lower)) {
    return 'EVALUATE';
  }
  // Analyze keywords
  if (/\b(analyze|distinguish|differentiate|examine|investigate|break down|categorize)\b/.test(lower)) {
    return 'ANALYZE';
  }
  // Apply keywords
  if (/\b(apply|calculate|solve|implement|compute|demonstrate|operate|execute|derive)\b/.test(lower)) {
    return 'APPLY';
  }
  // Understand keywords
  if (/\b(explain|describe|discuss|summarize|paraphrase|clarify|interpret)\b/.test(lower)) {
    return 'UNDERSTAND';
  }
  // Remember keywords
  if (/\b(define|list|state|name|recall|identify|mention|what is|who is)\b/.test(lower)) {
    return 'REMEMBER';
  }

  return 'UNDERSTAND';
}

// Infer Question Difficulty based on length, complexity and marks
export function inferDifficulty(marks: number, bloomLevel: BloomLevel): Difficulty {
  if (marks <= 2 && (bloomLevel === 'REMEMBER' || bloomLevel === 'UNDERSTAND')) {
    return 'EASY';
  }
  if (marks >= 10 || bloomLevel === 'EVALUATE' || bloomLevel === 'CREATE') {
    return 'HARD';
  }
  return 'MEDIUM';
}

export interface ExtractedQuestionDraft {
  questionNumber: string;
  questionText: string;
  marks: number;
  section?: string;
  questionType: 'MCQ' | 'DESCRIPTIVE' | 'NUMERICAL' | 'CODE';
  parentQuestionNumber?: string;
  options?: string[];
  sourcePage?: number;
}

// Robust regex question parser for university paper formats
export function parseQuestionsFromRawText(rawText: string): ExtractedQuestionDraft[] {
  const questions: ExtractedQuestionDraft[] = [];
  const lines = rawText.split('\n');

  let currentSection = 'Part A';
  let currentQuestion: ExtractedQuestionDraft | null = null;

  // Patterns
  // Examples: "Q1.", "Q 1 (a)", "1.", "1 (a)", "Part B", "Section A", "[5 Marks]"
  const sectionRegex = /^(part|section)\s+([a-e1-5])/i;
  const questionStartRegex = /^(?:q(?:uestion)?\s*)?(\d+)(?:\s*[\(\.]\s*([a-zA-Z\d]+)\)?)?\s*[\.:\-)]\s*(.*)/i;
  const marksRegex = /\[\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)?\s*\]|\(\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)?\s*\)/i;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (!line) continue;

    // Check Section
    const sectionMatch = line.match(sectionRegex);
    if (sectionMatch) {
      currentSection = line;
      continue;
    }

    // Check Question Start
    const qMatch = line.match(questionStartRegex);
    if (qMatch) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }

      const mainNum = qMatch[1];
      const subNum = qMatch[2];
      const content = qMatch[3] || '';

      const marksMatch = line.match(marksRegex) || lines[lineIndex + 1]?.match(marksRegex);
      const marks = marksMatch ? parseFloat(marksMatch[1] || marksMatch[2]) : (currentSection.toLowerCase().includes('part a') ? 2.0 : 10.0);

      const qNumStr = subNum ? `${mainNum}(${subNum})` : mainNum;

      currentQuestion = {
        questionNumber: qNumStr,
        questionText: content.replace(marksRegex, '').trim(),
        marks,
        section: currentSection,
        questionType: 'DESCRIPTIVE',
        parentQuestionNumber: subNum ? mainNum : undefined,
        sourcePage: 1,
      };
    } else if (currentQuestion) {
      // Append lines to the current question text
      const cleanLine = line.replace(marksRegex, '').trim();
      if (cleanLine) {
        currentQuestion.questionText += ' ' + cleanLine;
      }
    }
  }

  if (currentQuestion) {
    questions.push(currentQuestion);
  }

  // Filter out headers/empty drafts
  return questions.filter(q => q.questionText.length > 5);
}
