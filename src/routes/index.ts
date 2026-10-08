import type { IncomingMessage, ServerResponse } from 'node:http';
import { parse } from 'node:url';
import { authService } from '../modules/auth/service.ts';
import { usersService } from '../modules/users/service.ts';
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
import { extractAuthUser, requireAuth, requireAdmin } from '../middleware/auth.ts';
import { formatErrorResponse } from '../middleware/error-handler.ts';
import { getCorsHeaders } from '../middleware/cors.ts';
import { checkRateLimit } from '../middleware/rate-limiter.ts';
import { logger } from '../utils/logger.ts';
import { openApiSpec } from './openapi.ts';

// Parse JSON request body
async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      // 10MB limit
      if (raw.length > 10 * 1024 * 1024) {
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any, origin?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...getCorsHeaders(origin),
  };
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

function sendHtml(res: ServerResponse, statusCode: number, html: string, origin?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    ...getCorsHeaders(origin),
  };
  res.writeHead(statusCode, headers);
  res.end(html);
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  const origin = req.headers.origin as string | undefined;
  const ip = req.socket.remoteAddress || '127.0.0.1';

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, getCorsHeaders(origin));
    res.end();
    return;
  }

  // Rate Limiting
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    sendJson(res, 429, {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Please retry in ${rateLimit.resetInSec} seconds.`,
      },
    }, origin);
    return;
  }

  const parsedUrl = parse(req.url || '/', true);
  const path = parsedUrl.pathname || '/';
  const query = parsedUrl.query;
  const method = req.method?.toUpperCase() || 'GET';
  const authUser = extractAuthUser(req.headers.authorization);

  logger.info(`${method} ${path}`, { ip, userId: authUser?.id });

  try {
    // HEALTH & READINESS CHECKS
    if (path === '/health' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        status: 'healthy',
        service: 'nithu25-backend',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      }, origin);
    }
    if (path === '/ready' && method === 'GET') {
      let dbReady = false;
      try {
        const check = dbService.get('SELECT 1 as alive');
        dbReady = !!check;
      } catch {
        dbReady = false;
      }
      return sendJson(res, dbReady ? 200 : 503, {
        success: dbReady,
        status: dbReady ? 'ready' : 'unhealthy',
        database: dbReady ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
      }, origin);
    }

    // OPENAPI DOCS
    if (path === '/api/docs/openapi.json' && method === 'GET') {
      return sendJson(res, 200, openApiSpec, origin);
    }
    if (path === '/api/docs' && method === 'GET') {
      const swaggerHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Nithu25 Production API Documentation</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body style="margin: 0; background: #fafafa;">
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ]
      });
    }
  </script>
</body>
</html>`;
      return sendHtml(res, 200, swaggerHtml, origin);
    }

    // 1. AUTH ROUTES
    if (path === '/api/auth/register' && method === 'POST') {
      const body = await readBody(req);
      if (!body.email || !body.password || !body.name) {
        throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Email, password, and name are required' };
      }
      const result = authService.register(body);
      return sendJson(res, 201, { success: true, data: result }, origin);
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readBody(req);
      if (!body.email || !body.password) {
        throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Email and password are required' };
      }
      const result = authService.login(body);
      return sendJson(res, 200, { success: true, data: result }, origin);
    }

    if (path === '/api/auth/guest' && method === 'POST') {
      const result = authService.createGuestSession();
      return sendJson(res, 201, { success: true, data: result }, origin);
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      return sendJson(res, 200, { success: true, data: { message: 'Logged out successfully' } }, origin);
    }

    if (path === '/api/users/me' && method === 'GET') {
      const user = requireAuth(authUser);
      const profile = authService.getUserProfile(user.id);
      return sendJson(res, 200, { success: true, data: profile }, origin);
    }

    if (path === '/api/users/profile' && method === 'PATCH') {
      const user = requireAuth(authUser);
      const body = await readBody(req);
      const updated = usersService.updateProfile(user.id, body);
      return sendJson(res, 200, { success: true, data: updated }, origin);
    }

    // 2. ACADEMIC STRUCTURE
    if (path === '/api/universities' && method === 'GET') {
      const list = academicService.listUniversities();
      return sendJson(res, 200, { success: true, data: list }, origin);
    }

    if (path === '/api/programs' && method === 'GET') {
      const list = academicService.listPrograms(query.departmentId as string);
      return sendJson(res, 200, { success: true, data: list }, origin);
    }

    if (path === '/api/semesters' && method === 'GET') {
      const list = academicService.listSemesters(query.programId as string);
      return sendJson(res, 200, { success: true, data: list }, origin);
    }

    if (path === '/api/subjects' && method === 'GET') {
      const list = academicService.listSubjects({
        courseId: query.courseId as string,
        search: query.search as string,
      });
      return sendJson(res, 200, { success: true, data: list }, origin);
    }

    const subjectMatch = path.match(/^\/api\/subjects\/([^\/]+)$/);
    if (subjectMatch && method === 'GET') {
      const sub = academicService.getSubject(subjectMatch[1]);
      if (!sub) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Subject not found' };
      return sendJson(res, 200, { success: true, data: sub }, origin);
    }

    const subjectUnitsMatch = path.match(/^\/api\/subjects\/([^\/]+)\/units$/);
    if (subjectUnitsMatch && method === 'GET') {
      const units = academicService.listUnits(subjectUnitsMatch[1]);
      return sendJson(res, 200, { success: true, data: units }, origin);
    }

    const unitTopicsMatch = path.match(/^\/api\/units\/([^\/]+)\/topics$/);
    if (unitTopicsMatch && method === 'GET') {
      const topics = academicService.listTopics(unitTopicsMatch[1]);
      return sendJson(res, 200, { success: true, data: topics }, origin);
    }

    if (path === '/api/topics/important' && method === 'GET') {
      const topics = analysisService.listImportantTopics(query.subjectId as string);
      return sendJson(res, 200, { success: true, data: topics }, origin);
    }

    const topicMatch = path.match(/^\/api\/topics\/([^\/]+)$/);
    if (topicMatch && method === 'GET') {
      const topic = academicService.getTopic(topicMatch[1]);
      if (!topic) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Topic not found' };
      return sendJson(res, 200, { success: true, data: topic }, origin);
    }

    // 3. QUESTIONS
    if (path === '/api/questions' && method === 'GET') {
      const result = questionsService.listQuestions({
        subjectId: query.subjectId as string,
        unitId: query.unitId as string,
        topicId: query.topicId as string,
        difficulty: query.difficulty as string,
        bloomLevel: query.bloomLevel as string,
        search: query.search as string,
        limit: query.limit ? parseInt(query.limit as string, 10) : 20,
        offset: query.offset ? parseInt(query.offset as string, 10) : 0,
      });
      return sendJson(res, 200, { success: true, data: result.items, meta: { total: result.total } }, origin);
    }

    const questionSimilarMatch = path.match(/^\/api\/questions\/([^\/]+)\/similar$/);
    if (questionSimilarMatch && method === 'GET') {
      const similar = questionsService.getSimilarQuestions(questionSimilarMatch[1]);
      return sendJson(res, 200, { success: true, data: similar }, origin);
    }

    const questionMatch = path.match(/^\/api\/questions\/([^\/]+)$/);
    if (questionMatch && method === 'GET') {
      const q = questionsService.getQuestion(questionMatch[1]);
      if (!q) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Question not found' };
      return sendJson(res, 200, { success: true, data: q }, origin);
    }

    // 4. PYQS
    if (path === '/api/pyqs' && method === 'GET') {
      const result = pyqService.listQuestionPapers({
        subjectId: query.subjectId as string,
        examType: query.examType as string,
        academicYear: query.academicYear as string,
      });
      return sendJson(res, 200, { success: true, data: result.items, meta: { total: result.total } }, origin);
    }

    const pyqAnalysisMatch = path.match(/^\/api\/pyqs\/([^\/]+)\/analysis$/);
    if (pyqAnalysisMatch && method === 'GET') {
      const analysis = pyqService.getPaperAnalysis(pyqAnalysisMatch[1]);
      if (!analysis) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Paper not found' };
      return sendJson(res, 200, { success: true, data: analysis }, origin);
    }

    const pyqMatch = path.match(/^\/api\/pyqs\/([^\/]+)$/);
    if (pyqMatch && method === 'GET') {
      const paper = pyqService.getQuestionPaper(pyqMatch[1]);
      if (!paper) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Paper not found' };
      return sendJson(res, 200, { success: true, data: paper }, origin);
    }

    // 5. ANALYSIS ENGINE
    const analysisSubjectMatch = path.match(/^\/api\/analysis\/subjects\/([^\/]+)$/);
    if (analysisSubjectMatch && method === 'GET') {
      const analysis = analysisService.getSubjectAnalysis(analysisSubjectMatch[1]);
      if (!analysis) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Subject not found' };
      return sendJson(res, 200, { success: true, data: analysis }, origin);
    }

    const analysisTopicMatch = path.match(/^\/api\/analysis\/topics\/([^\/]+)$/);
    if (analysisTopicMatch && method === 'GET') {
      const analysis = analysisService.getTopicAnalysis(analysisTopicMatch[1]);
      if (!analysis) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Topic not found' };
      return sendJson(res, 200, { success: true, data: analysis }, origin);
    }

    if (path === '/api/topics/important' && method === 'GET') {
      const topics = analysisService.listImportantTopics(query.subjectId as string);
      return sendJson(res, 200, { success: true, data: topics }, origin);
    }

    // 6. PRACTICE ENGINE
    if (path === '/api/practice/start' && method === 'POST') {
      const user = requireAuth(authUser);
      const body = await readBody(req);
      const session = practiceService.startSession({
        userId: user.id,
        mode: body.mode || 'RANDOM',
        subjectId: body.subjectId,
        unitId: body.unitId,
        topicId: body.topicId,
        questionCount: body.questionCount || 10,
      });
      return sendJson(res, 201, { success: true, data: session }, origin);
    }

    const practiceAnswerMatch = path.match(/^\/api\/practice\/([^\/]+)\/answer$/);
    if (practiceAnswerMatch && method === 'POST') {
      const user = requireAuth(authUser);
      const body = await readBody(req);
      const result = practiceService.submitAnswer({
        sessionId: practiceAnswerMatch[1],
        questionId: body.questionId,
        userAnswer: body.userAnswer,
        timeTakenSec: body.timeTakenSec,
      });
      return sendJson(res, 200, { success: true, data: result }, origin);
    }

    const practiceFinishMatch = path.match(/^\/api\/practice\/([^\/]+)\/finish$/);
    if (practiceFinishMatch && method === 'POST') {
      const user = requireAuth(authUser);
      const session = practiceService.finishSession(practiceFinishMatch[1]);
      return sendJson(res, 200, { success: true, data: session }, origin);
    }

    if (path === '/api/practice/history' && method === 'GET') {
      const user = requireAuth(authUser);
      const history = practiceService.getHistory(user.id);
      return sendJson(res, 200, { success: true, data: history }, origin);
    }

    const practiceSessionMatch = path.match(/^\/api\/practice\/([^\/]+)$/);
    if (practiceSessionMatch && method === 'GET') {
      const user = requireAuth(authUser);
      const session = practiceService.getSession(practiceSessionMatch[1]);
      if (!session) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Practice session not found' };
      return sendJson(res, 200, { success: true, data: session }, origin);
    }

    // 7. PROGRESS
    if (path === '/api/progress' && method === 'GET') {
      const user = requireAuth(authUser);
      const progress = progressService.getStudentProgress(user.id);
      return sendJson(res, 200, { success: true, data: progress }, origin);
    }

    if (path === '/api/progress/topics' && method === 'GET') {
      const user = requireAuth(authUser);
      const progress = progressService.getTopicProgress(user.id);
      return sendJson(res, 200, { success: true, data: progress }, origin);
    }

    if (path === '/api/progress/subjects' && method === 'GET') {
      const user = requireAuth(authUser);
      const progress = progressService.getSubjectProgress(user.id);
      return sendJson(res, 200, { success: true, data: progress }, origin);
    }

    // 8. REVISION SYSTEM
    if (path === '/api/revision' && method === 'GET') {
      const user = requireAuth(authUser);
      const queue = revisionService.getRevisionQueue(user.id);
      return sendJson(res, 200, { success: true, data: queue }, origin);
    }

    if (path === '/api/revision' && method === 'POST') {
      const user = requireAuth(authUser);
      const body = await readBody(req);
      const item = revisionService.addOrUpdate({
        userId: user.id,
        questionId: body.questionId,
        isBookmarked: body.isBookmarked,
        isImportant: body.isImportant,
        isIncorrect: body.isIncorrect,
      });
      return sendJson(res, 201, { success: true, data: item }, origin);
    }

    const revisionReviewMatch = path.match(/^\/api\/revision\/([^\/]+)$/);
    if (revisionReviewMatch && method === 'PATCH') {
      const user = requireAuth(authUser);
      const body = await readBody(req);
      const updated = revisionService.recordReview({
        userId: user.id,
        questionId: revisionReviewMatch[1],
        quality: body.quality || 4,
      });
      return sendJson(res, 200, { success: true, data: updated }, origin);
    }

    if (path === '/api/revision/bookmarks' && method === 'GET') {
      const user = requireAuth(authUser);
      const bookmarks = revisionService.getBookmarks(user.id);
      return sendJson(res, 200, { success: true, data: bookmarks }, origin);
    }

    // 9. STUDY PLANS
    if (path === '/api/study-plans' && method === 'GET') {
      const user = requireAuth(authUser);
      const plans = studyPlansService.listUserPlans(user.id);
      return sendJson(res, 200, { success: true, data: plans }, origin);
    }

    if (path === '/api/study-plans' && method === 'POST') {
      const user = requireAuth(authUser);
      const body = await readBody(req);
      const plan = studyPlansService.generatePlan({
        userId: user.id,
        title: body.title || 'Personalized Exam Study Plan',
        planType: body.planType || 'WEEKLY',
        subjectId: body.subjectId,
        examDate: body.examDate,
        targetHoursPerDay: body.targetHoursPerDay,
      });
      return sendJson(res, 201, { success: true, data: plan }, origin);
    }

    const studyPlanMatch = path.match(/^\/api\/study-plans\/([^\/]+)$/);
    if (studyPlanMatch && method === 'GET') {
      const user = requireAuth(authUser);
      const plan = studyPlansService.getPlan(studyPlanMatch[1]);
      if (!plan) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Study plan not found' };
      return sendJson(res, 200, { success: true, data: plan }, origin);
    }

    // 10. NITHU AI
    if (path === '/api/ai/chat' && method === 'POST') {
      const user = requireAuth(authUser);
      const body = await readBody(req);
      if (!body.prompt) throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Prompt is required' };
      const result = await nithuAiService.handleChat({
        conversationId: body.conversationId,
        userId: user.id,
        prompt: body.prompt,
        subjectId: body.subjectId,
      });
      return sendJson(res, 200, { success: true, data: result }, origin);
    }

    if (path === '/api/ai/conversations' && method === 'GET') {
      const user = requireAuth(authUser);
      const list = nithuAiService.listUserConversations(user.id);
      return sendJson(res, 200, { success: true, data: list }, origin);
    }

    const aiConversationMatch = path.match(/^\/api\/ai\/conversations\/([^\/]+)$/);
    if (aiConversationMatch && method === 'GET') {
      const user = requireAuth(authUser);
      const conv = nithuAiService.getConversation(aiConversationMatch[1]);
      if (!conv) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Conversation not found' };
      return sendJson(res, 200, { success: true, data: conv }, origin);
    }

    // 11. RESOURCES
    if (path === '/api/resources' && method === 'GET') {
      const resList = resourcesService.searchResources();
      return sendJson(res, 200, { success: true, data: resList }, origin);
    }

    if (path === '/api/resources/search' && method === 'GET') {
      const resList = resourcesService.searchResources(query.q as string);
      return sendJson(res, 200, { success: true, data: resList }, origin);
    }

    // 12. PWA OFFLINE SYNC
    if (path === '/api/sync' && method === 'POST') {
      const user = requireAuth(authUser);
      const body = await readBody(req);
      const result = await syncService.syncOfflineData({
        userId: user.id,
        changes: body.changes || [],
      });
      return sendJson(res, 200, { success: true, data: result }, origin);
    }

    // 13. ADMIN ENDPOINTS
    if (path.startsWith('/api/admin/')) {
      requireAdmin(authUser);

      if (path === '/api/admin/users' && method === 'GET') {
        const users = usersService.listUsers();
        return sendJson(res, 200, { success: true, data: users.items, meta: { total: users.total } }, origin);
      }

      if (path === '/api/admin/review' && method === 'GET') {
        const queue = adminService.getReviewQueue();
        return sendJson(res, 200, { success: true, data: queue }, origin);
      }

      const approveMatch = path.match(/^\/api\/admin\/review\/([^\/]+)\/approve$/);
      if (approveMatch && method === 'POST') {
        const body = await readBody(req);
        const approved = adminService.approveQuestion(approveMatch[1], body);
        return sendJson(res, 200, { success: true, data: approved }, origin);
      }

      const rejectMatch = path.match(/^\/api\/admin\/review\/([^\/]+)\/reject$/);
      if (rejectMatch && method === 'POST') {
        const body = await readBody(req);
        const rejected = adminService.rejectQuestion(rejectMatch[1], body.reason);
        return sendJson(res, 200, { success: true, data: rejected }, origin);
      }

      if (path === '/api/admin/pyqs/upload' && method === 'POST') {
        const body = await readBody(req);
        const paper = pyqService.createQuestionPaper({
          universityId: body.universityId,
          subjectId: body.subjectId,
          examType: body.examType || 'FAT',
          academicYear: body.academicYear || '2025-2026',
          originalFileUrl: body.originalFileUrl || '/uploads/sample-paper.pdf',
        });

        // Trigger ingestion pipeline synchronously or background
        if (body.rawText) {
          await ingestionPipeline.execute({
            paperId: paper.id,
            rawText: body.rawText,
            ocrConfidence: body.ocrConfidence || 'HIGH_CONFIDENCE',
          });
        }

        return sendJson(res, 201, { success: true, data: paper }, origin);
      }

      if (path === '/api/admin/sources' && method === 'GET') {
        const sources = sourcesService.listSources();
        return sendJson(res, 200, { success: true, data: sources }, origin);
      }

      if (path === '/api/admin/sources' && method === 'POST') {
        const body = await readBody(req);
        const src = sourcesService.createSource(body);
        return sendJson(res, 201, { success: true, data: src }, origin);
      }

      const scanMatch = path.match(/^\/api\/admin\/sources\/([^\/]+)\/scan$/);
      if (scanMatch && method === 'POST') {
        const scan = await sourcesService.triggerScan(scanMatch[1]);
        return sendJson(res, 200, { success: true, data: scan }, origin);
      }

      if (path === '/api/admin/ingestion/jobs' && method === 'GET') {
        const jobs = adminService.getIngestionJobs();
        return sendJson(res, 200, { success: true, data: jobs }, origin);
      }

      if (path === '/api/admin/duplicates' && method === 'GET') {
        const dups = adminService.listDuplicateGroups();
        return sendJson(res, 200, { success: true, data: dups }, origin);
      }
    }

    // 404 NOT FOUND
    throw { statusCode: 404, code: 'NOT_FOUND', message: `Route ${method} ${path} not found` };

  } catch (error: any) {
    const formatted = formatErrorResponse(error);
    sendJson(res, formatted.statusCode, formatted.body, origin);
  } finally {
    const duration = Date.now() - startTime;
    logger.debug(`Handled in ${duration}ms`, { path, method, durationMs: duration });
  }
}
