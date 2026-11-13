/**
 * Wayfinder AI — Memory Types, Constants & Schemas
 */

export const MEMORY_STORAGE_KEY = "wayfinder_memory_store";
export const CONFIG_STORAGE_KEY = "wayfinder_memory_config";

export const MEMORY_TYPES = {
  LONG_TERM: "long_term",
  PROJECT: "project",
  WORKING_CONTEXT: "working_context",
  KNOWLEDGE: "knowledge"
};

export const DEFAULT_CONFIG = {
  activeProject: "Wayfinder AI",
  defaultTokenBudget: 1000,
  memoryEnabled: true,          // Master toggle for memory retrieval & injection
  autoRememberActivity: true,   // Opt-in toggle to record browsing activities & searches
  weights: {
    lexical: 1.5,
    domain: 2.0,
    project: 2.2,
    importance: 1.2,
    recency: 0.8
  },
  quotas: {
    long_term: 0.25,     // 25% of token budget
    project: 0.40,       // 40% of token budget
    knowledge: 0.20,     // 20% of token budget
    working_context: 0.15 // 15% of token budget
  }
};

export const DEFAULT_STARTER_MEMORIES = [
  {
    id: "mem_starter_bio",
    type: MEMORY_TYPES.LONG_TERM,
    title: "Senior Full-Stack Developer Profile",
    content: "Senior software engineer with expertise in TypeScript, Node.js, modern web standards, and cloud deployments. Prefers concise, direct answers, bulleted tradeoffs, and production-ready code with zero fluff.",
    category: "bio",
    project: "Global",
    tags: ["typescript", "nodejs", "concise", "senior", "engineering"],
    domains: [],
    importance: 5,
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000 * 30,
    accessCount: 1,
    lastAccessedAt: Date.now(),
    source: "default"
  },
  {
    id: "mem_starter_project",
    type: MEMORY_TYPES.PROJECT,
    title: "Wayfinder AI Project Overview",
    content: "Wayfinder AI is an autonomous, context-aware Chrome Extension and cloud gateway. Uses Vanilla JS frontend, Chrome Extension Manifest V3, Node.js server gateway deployed on Railway, and Stripe for subscriptions. Enforces high-density in-page navigation assistance.",
    category: "architecture",
    project: "Wayfinder AI",
    tags: ["wayfinder", "chrome-extension", "railway", "stripe", "manifest-v3", "architecture"],
    domains: ["github.com", "railway.app", "stripe.com"],
    importance: 5,
    createdAt: Date.now() - 86400000 * 14,
    updatedAt: Date.now() - 86400000 * 14,
    accessCount: 1,
    lastAccessedAt: Date.now(),
    source: "default"
  },
  {
    id: "mem_starter_railway_knowledge",
    type: MEMORY_TYPES.KNOWLEDGE,
    title: "Railway Deployment & Secret Protocol",
    content: "All cloud secrets (OPENAI_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) are stored strictly in Railway environment variables. The server gateway isolates keys from client extensions and masks all error messages against credential leakage.",
    category: "gotcha",
    project: "Wayfinder AI",
    tags: ["railway", "security", "secrets", "api-key", "deployment"],
    domains: ["railway.app", "github.com"],
    importance: 4,
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 7,
    accessCount: 1,
    lastAccessedAt: Date.now(),
    source: "default"
  }
];
