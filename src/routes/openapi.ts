// Servers list is built at module load time so the correct APP_URL is used
// in production (e.g. https://nithu25-production.up.railway.app) without
// hardcoding any hostname. Set APP_URL in your Railway/cloud environment.
function buildServers() {
  const appUrl = process.env.APP_URL;
  const servers: { url: string; description: string }[] = [];
  if (appUrl && appUrl !== 'http://localhost:3000') {
    servers.push({ url: appUrl, description: 'Production Server' });
  }
  servers.push({ url: 'http://localhost:3000', description: 'Local Development Server' });
  return servers;
}

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Nithu25 Production Backend API",
    version: "1.0.0",
    description: "Production-ready REST API for Nithu25 - AI-powered college exam preparation platform. Built for direct consumption by Lovable frontend."
  },
  servers: buildServers(),
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      ApiResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "object" },
          meta: { type: "object" }
        }
      },
      ApiErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "INVALID_CREDENTIALS" },
              message: { type: "string", example: "Invalid email or password." }
            }
          }
        }
      }
    }
  },
  paths: {
    "/health": {
      get: {
        summary: "System Health Check",
        responses: { "200": { description: "Service is healthy" } }
      }
    },
    "/ready": {
      get: {
        summary: "System Readiness Check",
        responses: { "200": { description: "Service and database are ready" } }
      }
    },
    "/api/auth/register": {
      post: {
        summary: "Register new student user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "name"],
                properties: {
                  email: { type: "string" },
                  password: { type: "string" },
                  name: { type: "string" }
                }
              }
            }
          }
        },
        responses: { "201": { description: "User registered" } }
      }
    },
    "/api/auth/login": {
      post: {
        summary: "Login with email & password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string" },
                  password: { type: "string" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "JWT access token returned" } }
      }
    },
    "/api/auth/guest": {
      post: {
        summary: "Create guest session for anonymous usage",
        responses: { "201": { description: "Guest token returned" } }
      }
    },
    "/api/users/me": {
      get: {
        summary: "Get current user profile",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Profile data" } }
      }
    },
    "/api/subjects": {
      get: {
        summary: "List academic subjects",
        responses: { "200": { description: "List of subjects" } }
      }
    },
    "/api/questions": {
      get: {
        summary: "Search & filter questions",
        parameters: [
          { name: "subjectId", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } }
        ],
        responses: { "200": { description: "List of questions" } }
      }
    },
    "/api/pyqs": {
      get: {
        summary: "List archived question papers",
        responses: { "200": { description: "List of PYQ papers" } }
      }
    },
    "/api/analysis/subjects/{id}": {
      get: {
        summary: "Get PYQ analytics and frequency for a subject",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Subject analytics" } }
      }
    },
    "/api/topics/important": {
      get: {
        summary: "Get topics ranked by explainable importance score (0-100)",
        responses: { "200": { description: "Ranked important topics" } }
      }
    },
    "/api/practice/start": {
      post: {
        summary: "Start a practice session (supports 10 modes)",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Practice session initialized" } }
      }
    },
    "/api/ai/chat": {
      post: {
        summary: "Nithu AI chat assistant with RAG & verified citations",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["prompt"],
                properties: {
                  prompt: { type: "string" },
                  conversationId: { type: "string" },
                  subjectId: { type: "string" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Grounded AI response" } }
      }
    },
    "/api/revision": {
      get: {
        summary: "Get spaced repetition revision queue",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Due questions for revision" } }
      },
      post: {
        summary: "Add or bookmark a question for revision",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Revision item saved" } }
      }
    },
    "/api/study-plans": {
      get: {
        summary: "List user study plans",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "User study plans" } }
      },
      post: {
        summary: "Generate personalized study plan",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Generated study plan" } }
      }
    },
    "/api/progress": {
      get: {
        summary: "Get student performance dashboard & accuracy",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Progress summary" } }
      }
    },
    "/api/admin/review": {
      get: {
        summary: "Admin review queue for machine-processed questions",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Review queue" } }
      }
    },
    "/api/admin/pyqs/upload": {
      post: {
        summary: "Upload PYQ paper and trigger 12-stage ingestion pipeline",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Paper created and processed" } }
      }
    },
    "/api/sync": {
      post: {
        summary: "PWA offline synchronization",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Sync result" } }
      }
    }
  }
};
