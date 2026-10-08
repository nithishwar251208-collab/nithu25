import { seedDatabase } from '../seed/seed.ts';
import { dbService } from '../database/db.ts';
import { authService } from '../modules/auth/service.ts';
import { academicService } from '../modules/academic/service.ts';
import { pyqService } from '../modules/pyqs/service.ts';
import { questionsService } from '../modules/questions/service.ts';
import { analysisService } from '../modules/analysis/service.ts';
import { practiceService } from '../modules/practice/service.ts';
import { progressService } from '../modules/progress/service.ts';
import { revisionService } from '../modules/revision/service.ts';
import { studyPlansService } from '../modules/study-plans/service.ts';
import { nithuAiService } from '../modules/ai/service.ts';
import { resourcesService } from '../modules/resources/service.ts';
import { sourcesService } from '../modules/sources/service.ts';
import { adminService } from '../modules/admin/service.ts';
import { syncService } from '../modules/sync/service.ts';
import { ingestionPipeline } from '../modules/ingestion/pipeline.ts';
import { verifyPassword, signJwt, verifyJwt } from '../utils/crypto.ts';
import { normalizeText, computeTextHash, levenshteinSimilarity } from '../utils/text.ts';
import { cosineSimilarity, generateDeterministicEmbedding } from '../utils/vectors.ts';
import { logger } from '../utils/logger.ts';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, extra?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, extra ? extra : '');
    failedTests++;
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('   RUNNING NITHU25 PRODUCTION BACKEND TEST SUITE');
  console.log('======================================================\n');

  // 1. Seed Database
  console.log('[1/18] Testing Database Seeding...');
  await seedDatabase();
  const userCount = dbService.get<{ count: number }>(`SELECT COUNT(*) as count FROM users`)?.count || 0;
  assert(userCount >= 2, 'Database seeded users correctly');

  // 2. Auth: Register & Login
  console.log('\n[2/18] Testing Authentication Service...');
  const testEmail = `test_${Date.now()}@nithu25.edu`;
  const regResult = authService.register({
    email: testEmail,
    password: 'Password123!',
    name: 'Unit Tester',
  });
  assert(!!regResult.token, 'User registration returns JWT token');
  assert(regResult.user.email === testEmail, 'User registration has correct email');

  const loginResult = authService.login({
    email: testEmail,
    password: 'Password123!',
  });
  assert(!!loginResult.token, 'User login succeeds with correct password');

  let loginFailed = false;
  try {
    authService.login({ email: testEmail, password: 'WrongPassword' });
  } catch {
    loginFailed = true;
  }
  assert(loginFailed, 'User login rejects invalid credentials');

  // 3. Guest Session
  console.log('\n[3/18] Testing Guest Sessions...');
  const guestResult = authService.createGuestSession();
  assert(guestResult.user.role === 'GUEST', 'Guest user has GUEST role');
  assert(guestResult.user.name === 'Guest Student', 'Guest user has default name');

  // 4. Crypto & JWT verification
  console.log('\n[4/18] Testing Cryptography & JWT verification...');
  const jwtPayload = verifyJwt(regResult.token);
  assert(jwtPayload?.userId === regResult.user.id, 'JWT payload decodes user ID correctly');
  assert(jwtPayload?.role === 'STUDENT', 'JWT payload retains correct role');

  // 5. Academic Hierarchy
  console.log('\n[5/18] Testing Academic Hierarchy...');
  const unis = academicService.listUniversities();
  assert(unis.length > 0, 'Universities listed successfully');

  const subjects = academicService.listSubjects();
  assert(subjects.length > 0, 'Subjects listed successfully');
  const dsaSubject = subjects.find((s: any) => s.code === 'BCSE202L');
  assert(!!dsaSubject, 'BCSE202L Data Structures subject exists');

  const units = academicService.listUnits(dsaSubject.id);
  assert(units.length === 5, 'Subject has 5 syllabus units');

  // 6. PYQ Processing & Questions
  console.log('\n[6/18] Testing PYQ & Questions Service...');
  const pyqs = pyqService.listQuestionPapers();
  assert(pyqs.items.length > 0, 'Archived question papers found');

  const questions = questionsService.listQuestions({ subjectId: dsaSubject.id });
  assert(questions.items.length >= 8, 'Extracted questions retrieved from paper');

  const q1 = questions.items[0];
  const q1Detail = questionsService.getQuestion(q1.id);
  assert(q1Detail !== null, 'Get single question retrieves detailed metadata');

  // 7. Duplicate Detection & Similar Questions
  console.log('\n[7/18] Testing Duplicate Detection & Vector Similarity...');
  const similar = questionsService.getSimilarQuestions(q1.id);
  assert(Array.isArray(similar), 'Similar questions endpoint returns array');

  const textNorm = normalizeText('Explain Shortest Path & Dijkstra Algorithm!!!');
  assert(textNorm === 'explain shortest path dijkstra algorithm', 'Text normalization cleans strings correctly');

  const levSim = levenshteinSimilarity('dijkstra algorithm', 'dijkstra algorithms');
  assert(levSim > 0.9, 'Levenshtein similarity correctly matches near duplicates');

  const vecA = generateDeterministicEmbedding('binary search tree avl rotations');
  const vecB = generateDeterministicEmbedding('binary search tree avl rotation');
  const cosSim = cosineSimilarity(vecA, vecB);
  assert(cosSim > 0.85, 'Cosine vector similarity identifies semantic proximity');

  // 8. PYQ Analysis & Explainable Topic Importance Score
  console.log('\n[8/18] Testing PYQ Analytics & Importance Scoring...');
  const subjectAnalysis = analysisService.getSubjectAnalysis(dsaSubject.id);
  assert(subjectAnalysis !== null, 'Subject analysis generated');
  assert(subjectAnalysis?.unitBreakdown.length > 0, 'Unit breakdown generated');

  const importantTopics = analysisService.listImportantTopics(dsaSubject.id);
  assert(importantTopics.length > 0, 'Important topics calculated');
  const topTopic = importantTopics[0];
  assert(topTopic.importance_score >= 0 && topTopic.importance_score <= 100, 'Importance score is between 0 and 100');
  assert(topTopic.explanation.length > 0, 'Importance score provides transparent explanation');

  // 9. Practice Engine
  console.log('\n[9/18] Testing Practice Engine (10 Modes)...');
  const practiceSession = practiceService.startSession({
    userId: regResult.user.id,
    mode: 'IMPORTANT_TOPICS',
    subjectId: dsaSubject.id,
    questionCount: 3,
  });
  assert(practiceSession !== null, 'Practice session initialized');
  assert(practiceSession?.questions.length === 3, 'Practice session has exact requested question count');

  const firstQuestion = practiceSession?.questions[0];
  const answerResult = practiceService.submitAnswer({
    sessionId: practiceSession.id,
    questionId: firstQuestion.id,
    userAnswer: 'Standard academic answer explanation for evaluation.',
    timeTakenSec: 45,
  });
  assert(answerResult.questionId === firstQuestion.id, 'Answer submitted and scored');

  const finishedSession = practiceService.finishSession(practiceSession.id);
  assert(finishedSession?.is_completed === 1, 'Practice session successfully finished');

  // 10. Student Progress Tracking
  console.log('\n[10/18] Testing Student Progress Tracking...');
  const progress = progressService.getStudentProgress(regResult.user.id);
  assert(progress.totalQuestionsAttempted >= 1, 'Questions attempted recorded in progress');
  assert(progress.completedSessionsCount >= 1, 'Completed practice sessions recorded');

  // 11. Revision System (Spaced Repetition SM-2)
  console.log('\n[11/18] Testing Spaced Repetition & Revision System...');
  const revItem = revisionService.addOrUpdate({
    userId: regResult.user.id,
    questionId: firstQuestion.id,
    isBookmarked: true,
    isImportant: true,
  });
  assert(revItem?.is_bookmarked === 1, 'Question bookmarked for revision');

  const reviewedItem = revisionService.recordReview({
    userId: regResult.user.id,
    questionId: firstQuestion.id,
    quality: 4, // Good recall
  });
  assert(reviewedItem?.repetitions === 1, 'Repetition count increased via SM-2');

  const bookmarks = revisionService.getBookmarks(regResult.user.id);
  assert(bookmarks.length >= 1, 'Bookmarks list retrieved');

  // 12. Personalized Study Plans
  console.log('\n[12/18] Testing Personalized Study Plans...');
  const plan = studyPlansService.generatePlan({
    userId: regResult.user.id,
    title: '7-Day BCSE202L Exam Sprint',
    planType: 'WEEKLY',
    subjectId: dsaSubject.id,
    targetHoursPerDay: 3.0,
  });
  assert(plan !== null, 'Personalized study plan created');
  assert(plan?.schedule.length === 7, 'Study plan has 7 structured day schedules');

  // 13. Nithu AI with RAG & Citations
  console.log('\n[13/18] Testing Nithu AI Assistant (RAG Pipeline)...');
  const chatResponse = await nithuAiService.handleChat({
    userId: regResult.user.id,
    prompt: 'Explain the concept of Binary Search Trees and how rotations work in AVL trees',
    subjectId: dsaSubject.id,
  });
  assert(!!chatResponse.response.content, 'Nithu AI generated response content');
  assert(chatResponse.response.intent === 'explain_concept', 'Nithu AI detected intent correctly');
  assert(chatResponse.response.sources.length > 0, 'Nithu AI cites retrieved sources');
  assert(!!chatResponse.response.disclaimer, 'Nithu AI includes historical trend non-guarantee disclaimer');

  // 14. Educational Resources Search
  console.log('\n[14/18] Testing Educational Resources Search...');
  const resources = resourcesService.searchResources('nptel');
  assert(resources.length > 0, 'Approved educational resource found');
  assert(resources[0].source_domain === 'nptel.ac.in', 'Resource domain verified');

  // 15. Source Registry & Scanner
  console.log('\n[15/18] Testing Source Registry & Scanner...');
  const sources = sourcesService.listSources();
  assert(sources.length >= 2, 'Configured PYQ sources retrieved');
  const scanResult = await sourcesService.triggerScan(sources[0].id);
  assert(scanResult.status === 'COMPLETED', 'Source scan triggered with robots compliance check');

  // 16. Admin Review Queue & Moderation
  console.log('\n[16/18] Testing Admin Review & Moderation...');
  const reviewQueue = adminService.getReviewQueue();
  assert(typeof reviewQueue.pendingCount === 'number', 'Review queue retrieves pending count');

  const approvedQ = adminService.approveQuestion(q1.id, { marks: 2.0 });
  assert(approvedQ.verification_status === 'ADMIN_REVIEWED', 'Admin question approval status updated');

  // 17. Offline PWA Synchronization
  console.log('\n[17/18] Testing Offline PWA Synchronization...');
  const syncResult = await syncService.syncOfflineData({
    userId: regResult.user.id,
    changes: [
      {
        entityType: 'BOOKMARK',
        entityId: q1.id,
        clientVersion: 1,
        data: { questionId: q1.id, isBookmarked: true },
        updatedAt: new Date().toISOString(),
      }
    ]
  });
  assert(syncResult.appliedCount === 1, 'Offline client bookmark synced successfully');

  // 18. Ingestion Pipeline on Scanned Paper Draft
  console.log('\n[18/18] Testing Ingestion Pipeline on Scanned Draft...');
  const newPaper = pyqService.createQuestionPaper({
    universityId: unis[0].id,
    subjectId: dsaSubject.id,
    examType: 'CAT1',
    academicYear: '2025-2026',
    originalFileUrl: '/uploads/CAT1_2025_DSA.pdf',
  });

  const ingestionRes = await ingestionPipeline.execute({
    paperId: newPaper.id,
    rawText: 'Q1. Define Stack Applications & Expression Evaluation. [5 Marks]\nQ2. Explain Shortest Path & Dijkstra Algorithm. [10 Marks]',
    ocrConfidence: 'HIGH_CONFIDENCE',
  });
  assert(ingestionRes.extractedCount === 2, 'Pipeline extracted exactly 2 questions');
  assert(ingestionRes.duplicateCount >= 1, 'Pipeline detected duplicates against previous archive');

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
