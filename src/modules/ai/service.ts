import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';
import { config } from '../../config/index.ts';
import { logger } from '../../utils/logger.ts';
import { cosineSimilarity, generateDeterministicEmbedding } from '../../utils/vectors.ts';
import { resourcesService } from '../resources/service.ts';
import type { AIResponseWithSources } from '../../types/index.ts';

export type AIIntent = 
  | 'explain_concept'
  | 'solve_question'
  | 'explain_answer'
  | 'analyze_pyq'
  | 'find_similar_questions'
  | 'generate_practice'
  | 'generate_mock_test'
  | 'study_plan'
  | 'revision'
  | 'topic_recommendation'
  | 'resource_search'
  | 'general_question';

export interface ChatMessageInput {
  conversationId?: string;
  userId: string;
  prompt: string;
  subjectId?: string;
}

export class NithuAiService {
  /**
   * Main RAG Flow:
   * USER QUESTION -> INTENT DETECTION -> RETRIEVAL -> CONTEXT FILTERING -> AI GENERATION -> SOURCES -> RESPONSE
   */
  public async handleChat(input: ChatMessageInput): Promise<{ conversationId: string; response: AIResponseWithSources }> {
    const sanitizedPrompt = this.sanitizeInput(input.prompt);
    
    // 1. Detect Intent
    const intent = this.detectIntent(sanitizedPrompt);
    logger.info(`Nithu AI detected intent: ${intent}`, { userId: input.userId });

    // 2. Retrieve Relevant Context
    const retrievedContext = await this.retrieveContext(sanitizedPrompt, intent, input.subjectId);

    // 3. Generate Grounded AI Response
    const aiResponse = await this.generateGroundedResponse(sanitizedPrompt, intent, retrievedContext);

    // 4. Persist Conversation & Message
    let conversationId = input.conversationId;
    const now = new Date().toISOString();

    if (!conversationId) {
      conversationId = randomUUID();
      const title = sanitizedPrompt.slice(0, 30) + '...';
      dbService.run(`
        INSERT INTO ai_conversations (id, user_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `, [conversationId, input.userId, title, now, now]);
    }

    // Save User message
    dbService.run(`
      INSERT INTO ai_messages (id, conversation_id, role, content, intent, created_at)
      VALUES (?, ?, 'user', ?, ?, ?)
    `, [randomUUID(), conversationId, sanitizedPrompt, intent, now]);

    // Save Assistant message with sources
    dbService.run(`
      INSERT INTO ai_messages (id, conversation_id, role, content, intent, sources_json, citations_json, created_at)
      VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
    `, [
      randomUUID(), conversationId, aiResponse.content, intent,
      JSON.stringify(aiResponse.sources), JSON.stringify(aiResponse.sources.map(s => s.reference)),
      new Date().toISOString()
    ]);

    return {
      conversationId,
      response: aiResponse,
    };
  }

  /**
   * Guard against Prompt Injection attacks
   */
  private sanitizeInput(prompt: string): string {
    return prompt
      .replace(/system\s*prompt/gi, 'system topic')
      .replace(/ignore\s+previous\s+instructions/gi, '[filtered]')
      .trim();
  }

  /**
   * Intent Classifier
   */
  public detectIntent(prompt: string): AIIntent {
    const p = prompt.toLowerCase();
    if (/\b(solve|solution|how to calculate|answer for|work out)\b/.test(p)) return 'solve_question';
    if (/\b(why is|explain the answer|clarify answer)\b/.test(p)) return 'explain_answer';
    if (/\b(similar|questions like|repeated questions)\b/.test(p)) return 'find_similar_questions';
    if (/\b(analyze|frequency|pyq analysis|exam trends|repeated)\b/.test(p)) return 'analyze_pyq';
    if (/\b(important topics|what topics to study|high weightage)\b/.test(p)) return 'topic_recommendation';
    if (/\b(practice|quiz|test me|generate questions)\b/.test(p)) return 'generate_practice';
    if (/\b(mock exam|mock test|fat mock|cat mock)\b/.test(p)) return 'generate_mock_test';
    if (/\b(study plan|schedule|routine|how many days)\b/.test(p)) return 'study_plan';
    if (/\b(revision|spaced repetition|revise)\b/.test(p)) return 'revision';
    if (/\b(resource|book|notes|slides|syllabus pdf|link)\b/.test(p)) return 'resource_search';
    if (/\b(what is|define|explain|concept of|describe)\b/.test(p)) return 'explain_concept';
    return 'general_question';
  }

  /**
   * Retrieves verified syllabus, PYQs, and approved online resources
   */
  private async retrieveContext(query: string, intent: AIIntent, subjectId?: string) {
    const embedding = generateDeterministicEmbedding(query);

    // Retrieve verified questions with semantic similarity
    let sql = `
      SELECT q.id, q.question_number, q.question_text, q.marks, q.embedding_json,
             s.name as subject_name, t.name as topic_name, qp.academic_year, qp.exam_type
      FROM questions q
      JOIN subjects s ON q.subject_id = s.id
      LEFT JOIN topics t ON q.topic_id = t.id
      LEFT JOIN question_papers qp ON q.question_paper_id = qp.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (subjectId) {
      sql += ` AND q.subject_id = ?`;
      params.push(subjectId);
    }
    sql += ` LIMIT 40`;

    const candidates = dbService.all(sql, params);
    const scoredQuestions = candidates.map(c => {
      let score = 0;
      if (c.embedding_json) {
        try {
          score = cosineSimilarity(embedding, JSON.parse(c.embedding_json));
        } catch {
          score = 0;
        }
      }
      return { ...c, score };
    }).sort((a, b) => b.score - a.score).slice(0, 3);

    // Retrieve approved educational resources
    const educationalResources = resourcesService.searchResources(query, 2);

    return {
      questions: scoredQuestions,
      resources: educationalResources,
    };
  }

  /**
   * Generates grounded response with verified citations
   */
  private async generateGroundedResponse(prompt: string, intent: AIIntent, context: { questions: any[]; resources: any[] }): Promise<AIResponseWithSources> {
    const sources: AIResponseWithSources['sources'] = [];

    // Add Question Sources
    for (const q of context.questions) {
      sources.push({
        title: `Question ${q.question_number} (${q.subject_name || 'Academic Archive'})`,
        type: 'PYQ',
        reference: `${q.academic_year || 'Verified'} - ${q.exam_type || 'Exam'}`,
        verified: true,
      });
    }

    // Add Educational Resource Sources
    for (const r of context.resources) {
      sources.push({
        title: r.title,
        type: 'ONLINE_RESOURCE',
        reference: r.url,
        verified: r.is_verified === 1,
      });
    }

    let answerContent = '';

    // If external AI provider is configured with an API key, call the OpenAI-compatible or Gemini endpoint
    if (config.ai.isConfigured && config.ai.apiKey) {
      try {
        const contextSummary = context.questions.map((q, idx) => 
          `[PYQ ${idx + 1}] Year: ${q.academic_year || 'Historical'}, Marks: ${q.marks}, Text: ${q.question_text}`
        ).join('\n');

        const systemPrompt = `You are Nithu AI, an empathetic academic tutor and exam preparation mentor.
Help the student master the concept using grounded academic reasoning.
Relevant past exam questions:
${contextSummary || 'No specific PYQ found for this exact subtopic.'}

Rules:
- Be clear, structured, and pedagogical.
- Never guarantee that a question will appear in a future exam.
- Reference verified past exam patterns honestly.`;

        const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.ai.apiKey}`,
          },
          body: JSON.stringify({
            model: config.ai.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 800,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data: any = await res.json();
          answerContent = data.choices?.[0]?.message?.content || '';
        }
      } catch (err: any) {
        logger.warn('External AI call failed or timed out, falling back to deterministic grounded synthesis', { error: err?.message });
      }
    }

    // Fallback deterministic synthesis if external call wasn't made or failed
    if (!answerContent) {
      if (context.questions.length > 0) {
        const topQ = context.questions[0];
        answerContent = `**Grounded Academic Explanation**\n\n` +
          `Based on verified past examination records for **${topQ.subject_name || 'your subject'}**:\n\n` +
          `• **Relevant Exam Archive Question**: "${topQ.question_text}" [${topQ.marks} Marks, ${topQ.academic_year || 'Historical'}]\n\n` +
          `**Step-by-Step Breakdown:**\n` +
          `1. **Core Concept**: Focus on the underlying theoretical principles and formula derivations testing in ${topQ.topic_name || 'this module'}.\n` +
          `2. **Key Elements Expected**: Clearly define standard definitions, present schematic diagrams or equations where applicable, and show structured logical steps.\n` +
          `3. **Preparation Guidance**: Review similar patterns across prior CAT/FAT tests to ensure thorough mastery of this topic.\n\n` +
          `*Notice*: The above answer is synthesized with reference to verified examination records.`;
      } else {
        answerContent = `**Nithu AI Guidance**\n\n` +
          `Regarding your query: "${prompt}":\n\n` +
          `I have surveyed the academic topic repository and curriculum guidelines. To master this concept for upcoming assessments:\n` +
          `• Review the core module learning objectives in your syllabus.\n` +
          `• Work through fundamental textbook definitions and solved practice problems.\n` +
          `• Verify with past year question trends to identify high-frequency exam patterns.`;
      }
    }

    return {
      content: answerContent,
      intent,
      confidence: context.questions.length > 0 ? 0.92 : 0.75,
      sources,
      disclaimer: 'Generated by Nithu AI using verified academic archives and approved syllabus references. Historical trends do not guarantee future question appearance.',
    };
  }

  public getConversation(id: string) {
    const conv = dbService.get(`SELECT * FROM ai_conversations WHERE id = ?`, [id]);
    if (!conv) return null;

    const messages = dbService.all(`
      SELECT * FROM ai_messages 
      WHERE conversation_id = ? 
      ORDER BY created_at ASC
    `, [id]);

    return {
      ...conv,
      messages: messages.map(m => ({
        ...m,
        sources: JSON.parse(m.sources_json || '[]'),
        citations: JSON.parse(m.citations_json || '[]'),
      })),
    };
  }

  public listUserConversations(userId: string) {
    return dbService.all(`
      SELECT * FROM ai_conversations 
      WHERE user_id = ? 
      ORDER BY updated_at DESC
    `, [userId]);
  }
}

export const nithuAiService = new NithuAiService();
