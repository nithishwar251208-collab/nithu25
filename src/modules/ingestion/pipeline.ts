import { randomUUID, createHash } from 'node:crypto';
import { dbService } from '../../database/db.ts';
import { logger } from '../../utils/logger.ts';
import { 
  normalizeText, 
  computeTextHash, 
  inferBloomLevel, 
  inferDifficulty, 
  parseQuestionsFromRawText,
  levenshteinSimilarity,
  jaccardSimilarity
} from '../../utils/text.ts';
import { generateDeterministicEmbedding, cosineSimilarity } from '../../utils/vectors.ts';
import type { 
  OcrConfidenceLevel, 
  Difficulty, 
  BloomLevel, 
  DuplicateMatchType, 
  VerificationStatus 
} from '../../types/index.ts';

export interface IngestionInput {
  paperId: string;
  rawText?: string;
  isScanned?: boolean;
  ocrConfidence?: OcrConfidenceLevel;
}

export interface IngestionResult {
  paperId: string;
  extractedCount: number;
  duplicateCount: number;
  lowConfidenceCount: number;
  status: 'COMPLETED' | 'ADMIN_REVIEW';
}

export class IngestionPipeline {
  /**
   * Executes the complete 12-stage PYQ ingestion pipeline
   */
  public async execute(input: IngestionInput, onProgress?: (pct: number) => void): Promise<IngestionResult> {
    logger.info(`Starting ingestion pipeline for paper: ${input.paperId}`);
    onProgress?.(5);

    // Stage 1 & 2: FETCH & VALIDATE PAPER
    const paper = dbService.get(`SELECT * FROM question_papers WHERE id = ?`, [input.paperId]);
    if (!paper) {
      throw new Error(`Question paper not found: ${input.paperId}`);
    }

    dbService.run(`UPDATE question_papers SET processing_status = 'PROCESSING' WHERE id = ?`, [input.paperId]);
    onProgress?.(15);

    // Stage 3 & 4: OCR IF REQUIRED & EXTRACT TEXT
    const ocrConfidence: OcrConfidenceLevel = input.ocrConfidence || (input.isScanned ? 'MEDIUM_CONFIDENCE' : 'HIGH_CONFIDENCE');
    const rawContent = input.rawText || '';

    onProgress?.(30);

    // Stage 5: EXTRACT QUESTIONS
    const parsedDrafts = parseQuestionsFromRawText(rawContent);
    logger.info(`Parsed ${parsedDrafts.length} raw questions from paper`, { paperId: input.paperId });

    if (parsedDrafts.length === 0) {
      // If parsing found no questions, flag for admin review
      dbService.run(`UPDATE question_papers SET processing_status = 'FAILED' WHERE id = ?`, [input.paperId]);
      throw new Error('No questions could be extracted from the document. Manual review required.');
    }

    onProgress?.(45);

    // Retrieve existing topics for the subject to classify questions
    const topics = dbService.all(`
      SELECT t.id, t.name, t.unit_id, u.number as unit_number 
      FROM topics t 
      JOIN units u ON t.unit_id = u.id 
      WHERE u.subject_id = ?
    `, [paper.subject_id]);

    const existingQuestions = dbService.all(`
      SELECT id, normalized_text, embedding_json, duplicate_group_id 
      FROM questions 
      WHERE subject_id = ?
    `, [paper.subject_id]);

    let extractedCount = 0;
    let duplicateCount = 0;
    let lowConfidenceCount = 0;

    // Stage 6 - 10: PROCESS EACH QUESTION
    for (let i = 0; i < parsedDrafts.length; i++) {
      const draft = parsedDrafts[i];
      const qId = randomUUID();
      const now = new Date().toISOString();

      // Normalization
      const normalized = normalizeText(draft.questionText);
      const textHash = computeTextHash(draft.questionText);

      // Classification (Topic & Unit match)
      let matchedTopicId: string | null = null;
      let matchedUnitId: string | null = null;

      for (const t of topics) {
        const topicNorm = normalizeText(t.name);
        if (normalized.includes(topicNorm) || topicNorm.split(' ').some(w => w.length > 3 && normalized.includes(w))) {
          matchedTopicId = t.id;
          matchedUnitId = t.unit_id;
          break;
        }
      }

      // If no exact keyword match, assign to first unit if available
      if (!matchedUnitId && topics.length > 0) {
        matchedTopicId = topics[0].id;
        matchedUnitId = topics[0].unit_id;
      }

      // Bloom's Taxonomy & Difficulty
      const bloomLevel: BloomLevel = inferBloomLevel(draft.questionText);
      const difficulty: Difficulty = inferDifficulty(draft.marks, bloomLevel);

      // Embeddings
      const embedding = generateDeterministicEmbedding(draft.questionText);
      const embeddingJson = JSON.stringify(embedding);

      // Duplicate Detection
      let duplicateGroupId: string | null = null;
      let matchType: DuplicateMatchType | null = null;

      for (const eq of existingQuestions) {
        // 1. Exact match
        if (eq.normalized_text === normalized) {
          matchType = 'EXACT_DUPLICATE';
          duplicateGroupId = eq.duplicate_group_id || this.createDuplicateGroup('Exact Duplicate Group', matchType);
          break;
        }

        // 2. Near match by Levenshtein or Token Jaccard overlap
        const levSim = levenshteinSimilarity(eq.normalized_text, normalized);
        const jaccard = jaccardSimilarity(eq.normalized_text, normalized);
        if (levSim > 0.85) {
          matchType = 'NEAR_DUPLICATE';
          duplicateGroupId = eq.duplicate_group_id || this.createDuplicateGroup('Near Duplicate Group', matchType);
          break;
        } else if (jaccard > 0.5) {
          matchType = 'SAME_CONCEPT_DIFFERENT_WORDING';
          duplicateGroupId = eq.duplicate_group_id || this.createDuplicateGroup('Same Concept Group', matchType);
          break;
        }

        // 3. Semantic similarity via vector cosine
        if (eq.embedding_json) {
          try {
            const eqVec = JSON.parse(eq.embedding_json);
            const cosSim = cosineSimilarity(embedding, eqVec);
            if (cosSim > 0.75) {
              matchType = 'SAME_CONCEPT_DIFFERENT_WORDING';
              duplicateGroupId = eq.duplicate_group_id || this.createDuplicateGroup('Semantic Duplicate Group', matchType);
              break;
            } else if (cosSim > 0.65) {
              matchType = 'SIMILAR_QUESTION';
              duplicateGroupId = eq.duplicate_group_id || this.createDuplicateGroup('Similar Question Group', matchType);
              break;
            }
          } catch {
            // Ignore vector parse error
          }
        }
      }

      if (duplicateGroupId) {
        duplicateCount++;
      }

      // OCR Confidence check
      let verificationStatus: VerificationStatus = 'MACHINE_PROCESSED';
      if (ocrConfidence === 'LOW_CONFIDENCE') {
        verificationStatus = 'UNVERIFIED';
        lowConfidenceCount++;
      }

      // Store Question in Database
      dbService.run(`
        INSERT INTO questions (
          id, question_paper_id, subject_id, unit_id, topic_id,
          question_number, question_text, normalized_text, marks,
          section, question_type, options_json, source_page,
          ocr_confidence, difficulty, bloom_level, is_ai_classified,
          duplicate_group_id, verification_status, embedding_json,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, 1,
          ?, ?, ?,
          ?, ?
        )
      `, [
        qId, paper.id, paper.subject_id, matchedUnitId, matchedTopicId,
        draft.questionNumber, draft.questionText, normalized, draft.marks,
        draft.section || null, draft.questionType, draft.options ? JSON.stringify(draft.options) : null, draft.sourcePage || 1,
        ocrConfidence, difficulty, bloomLevel,
        duplicateGroupId, verificationStatus, embeddingJson,
        now, now
      ]);

      extractedCount++;
      onProgress?.(45 + Math.floor((i / parsedDrafts.length) * 40));
    }

    // Stage 11: REFRESH TOPIC STATISTICS
    this.refreshSubjectStatistics(paper.subject_id);
    onProgress?.(90);

    // Stage 12: REVIEW & FINALIZE STATUS
    const finalPaperStatus = lowConfidenceCount > 0 ? 'COMPLETED' : 'COMPLETED';
    const paperVerification = lowConfidenceCount > 0 ? 'ADMIN_REVIEWED' : 'MACHINE_PROCESSED';

    dbService.run(`
      UPDATE question_papers 
      SET processing_status = ?, verification_status = ?, updated_at = ? 
      WHERE id = ?
    `, [finalPaperStatus, paperVerification, new Date().toISOString(), input.paperId]);

    onProgress?.(100);

    logger.info(`Ingestion pipeline completed successfully`, {
      paperId: input.paperId,
      extractedCount,
      duplicateCount,
      lowConfidenceCount,
    });

    return {
      paperId: input.paperId,
      extractedCount,
      duplicateCount,
      lowConfidenceCount,
      status: lowConfidenceCount > 0 ? 'ADMIN_REVIEW' : 'COMPLETED',
    };
  }

  private createDuplicateGroup(name: string, matchType: DuplicateMatchType): string {
    const id = randomUUID();
    dbService.run(`
      INSERT INTO duplicate_groups (id, name, match_type, created_at)
      VALUES (?, ?, ?, ?)
    `, [id, name, matchType, new Date().toISOString()]);
    return id;
  }

  /**
   * Recalculates Topic & PYQ Frequency, Marks Distribution, and Importance Scores
   */
  public refreshSubjectStatistics(subjectId: string): void {
    const topics = dbService.all<{ id: string; name: string }>(`
      SELECT t.id, t.name 
      FROM topics t 
      JOIN units u ON t.unit_id = u.id 
      WHERE u.subject_id = ?
    `, [subjectId]);

    const now = new Date().toISOString();

    for (const topic of topics) {
      const qRows = dbService.all(`
        SELECT q.marks, qp.academic_year, qp.exam_type 
        FROM questions q
        JOIN question_papers qp ON q.question_paper_id = qp.id
        WHERE q.topic_id = ?
      `, [topic.id]);

      const historicalFreq = qRows.length;
      if (historicalFreq === 0) continue;

      const years = new Set(qRows.map(r => r.academic_year));
      const yearCoverage = years.size;
      const totalMarks = qRows.reduce((sum, r) => sum + (r.marks || 0), 0);
      const marksWeight = Math.round(totalMarks * 10) / 10;

      // Recent frequency (last 2 academic years)
      const recentFreq = qRows.filter(r => r.academic_year.includes('2024') || r.academic_year.includes('2025') || r.academic_year.includes('2026')).length;
      const examCoverage = Array.from(new Set(qRows.map(r => r.exam_type)));

      // Trend analysis
      let trend: 'INCREASING' | 'STABLE' | 'DECREASING' | 'NEW' | 'RETURNING' = 'STABLE';
      if (recentFreq > historicalFreq * 0.6) {
        trend = 'INCREASING';
      } else if (recentFreq === 0 && historicalFreq > 2) {
        trend = 'DECREASING';
      } else if (yearCoverage === 1 && recentFreq > 0) {
        trend = 'NEW';
      }

      // Explainable Importance Score (0 - 100)
      // Factors: historical freq (max 30), recent freq (max 25), year coverage (max 20), marks weight (max 15), trend (max 10)
      const freqScore = Math.min(30, historicalFreq * 5);
      const recentScore = Math.min(25, recentFreq * 8);
      const yearScore = Math.min(20, yearCoverage * 6);
      const marksScore = Math.min(15, marksWeight * 0.5);
      const trendBonus = trend === 'INCREASING' ? 10 : trend === 'STABLE' ? 5 : 0;

      const rawImportance = Math.round(freqScore + recentScore + yearScore + marksScore + trendBonus);
      const importanceScore = Math.min(100, Math.max(10, rawImportance));

      const explanation = [];
      if (historicalFreq >= 3) explanation.push('High historical appearance frequency in PYQs');
      if (yearCoverage >= 2) explanation.push(`Appeared across ${yearCoverage} distinct academic years`);
      if (recentFreq > 0) explanation.push('Recently tested in examination cycles');
      if (marksWeight >= 15) explanation.push('High cumulative mark weight distribution');
      if (trend === 'INCREASING') explanation.push('Upward testing trend observed in recent exams');
      if (explanation.length === 0) explanation.push('Moderate historical topic relevance');

      dbService.run(`
        INSERT INTO topic_analyses (
          id, topic_id, importance_score, historical_freq, recent_freq,
          year_coverage, exam_coverage_json, marks_weight, concept_freq,
          trend, explanation_json, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, 1,
          ?, ?, ?
        )
        ON CONFLICT(topic_id) DO UPDATE SET
          importance_score = excluded.importance_score,
          historical_freq = excluded.historical_freq,
          recent_freq = excluded.recent_freq,
          year_coverage = excluded.year_coverage,
          exam_coverage_json = excluded.exam_coverage_json,
          marks_weight = excluded.marks_weight,
          trend = excluded.trend,
          explanation_json = excluded.explanation_json,
          updated_at = excluded.updated_at
      `, [
        randomUUID(), topic.id, importanceScore, historicalFreq, recentFreq,
        yearCoverage, JSON.stringify(examCoverage), marksWeight,
        trend, JSON.stringify(explanation), now
      ]);
    }
  }
}

export const ingestionPipeline = new IngestionPipeline();
