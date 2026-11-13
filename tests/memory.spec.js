import { test, expect } from '@playwright/test';
import { MemoryManager, MEMORY_TYPES } from '../src/services/memoryManager.js';

test.describe('Wayfinder AI Memory Layer & Context Engine Tests', () => {

  test.beforeEach(async () => {
    // Reset to clean default state before each test
    await MemoryManager.resetToDefaults();
  });

  test('MEM-1: Initialization populates 4 distinct memory partitions with defaults', async () => {
    const store = await MemoryManager.getStore();

    expect(Array.isArray(store[MEMORY_TYPES.LONG_TERM])).toBe(true);
    expect(Array.isArray(store[MEMORY_TYPES.PROJECT])).toBe(true);
    expect(Array.isArray(store[MEMORY_TYPES.WORKING_CONTEXT])).toBe(true);
    expect(Array.isArray(store[MEMORY_TYPES.KNOWLEDGE])).toBe(true);

    // Verify starter memory contents
    expect(store[MEMORY_TYPES.LONG_TERM].length).toBeGreaterThan(0);
    expect(store[MEMORY_TYPES.PROJECT].length).toBeGreaterThan(0);
    expect(store[MEMORY_TYPES.KNOWLEDGE].length).toBeGreaterThan(0);

    const bio = store[MEMORY_TYPES.LONG_TERM][0];
    expect(bio.title).toContain('Full-Stack');
    expect(bio.importance).toBe(5);
  });

  test('MEM-2: CRUD operations on memories across partitions', async () => {
    // 1. Add
    const added = await MemoryManager.addMemory({
      type: MEMORY_TYPES.PROJECT,
      title: 'Payment Integration Architecture',
      content: 'Uses Stripe Checkout sessions with Railway webhook verification at /api/v1/webhooks/stripe.',
      project: 'Wayfinder AI',
      tags: ['stripe', 'payments', 'webhook'],
      domains: ['stripe.com'],
      importance: 5
    });

    expect(added.id.startsWith('mem_')).toBe(true);
    expect(added.type).toBe(MEMORY_TYPES.PROJECT);
    expect(added.importance).toBe(5);

    // 2. Read
    const list = await MemoryManager.listMemories({ type: MEMORY_TYPES.PROJECT });
    expect(list.some(m => m.id === added.id)).toBe(true);

    // 3. Update
    const updated = await MemoryManager.updateMemory(added.id, {
      title: 'Updated Payment Integration Architecture',
      importance: 4
    });
    expect(updated.title).toBe('Updated Payment Integration Architecture');
    expect(updated.importance).toBe(4);

    // 4. Delete
    const deleted = await MemoryManager.deleteMemory(added.id);
    expect(deleted).toBe(true);

    const afterList = await MemoryManager.listMemories({ type: MEMORY_TYPES.PROJECT });
    expect(afterList.some(m => m.id === added.id)).toBe(false);
  });

  test('MEM-3: Hybrid Relevance Scoring (lexical, domain, project, importance, recency)', async () => {
    // Add specific knowledge items
    await MemoryManager.addMemory({
      type: MEMORY_TYPES.KNOWLEDGE,
      title: 'Stripe Webhook Secret Handling',
      content: 'Verify Stripe signature with STRIPE_WEBHOOK_SECRET before processing checkout.session.completed.',
      tags: ['stripe', 'security', 'webhook'],
      domains: ['stripe.com'],
      importance: 5
    });

    await MemoryManager.addMemory({
      type: MEMORY_TYPES.PROJECT,
      title: 'E-commerce Redesign Notes',
      content: 'Working on product listing grid CSS and search filters for shoes store.',
      project: 'FashionApp',
      tags: ['css', 'fashion'],
      domains: ['fashion.example.com'],
      importance: 2
    });

    // Query on stripe.com page context
    const retrieval = await MemoryManager.retrieveContext({
      query: 'How do we handle subscription checkout events?',
      pageContext: {
        domain: 'stripe.com',
        title: 'Stripe Documentation - Webhooks',
        condensedText: 'Receive real-time notifications when customers complete payments.'
      },
      activeProject: 'Wayfinder AI'
    });

    expect(retrieval.selectedMemories.length).toBeGreaterThan(0);
    const topMemory = retrieval.selectedMemories[0];

    // The Stripe webhook memory should score highest due to domain match + lexical match + importance
    expect(retrieval.selectedMemories.some(m => m.title.includes('Stripe'))).toBe(true);
    expect(retrieval.formattedPrompt).toContain('<user_memory_and_context>');
    expect(retrieval.formattedPrompt).toContain('Stripe');
  });

  test('MEM-4: Dynamic Token Budget Optimizer respects token limits and avoids context blowup', async () => {
    // Add multiple detailed memories
    for (let i = 1; i <= 10; i++) {
      await MemoryManager.addMemory({
        type: MEMORY_TYPES.PROJECT,
        title: `Project Spec Section ${i}`,
        content: `Detailed documentation for subsystem ${i}. This section contains detailed architectural specifications, API endpoints, schema definitions, and migration guidelines for project version ${i}.0.`.repeat(3),
        project: 'Wayfinder AI',
        importance: 3
      });
    }

    // Set a strict token limit of 250 tokens
    const strictBudget = 250;
    const result = await MemoryManager.retrieveContext({
      query: 'Architecture specifications',
      maxTokens: strictBudget
    });

    expect(result.tokenStats.used).toBeLessThanOrEqual(strictBudget + 30); // within allowance buffer
    expect(result.tokenStats.budget).toBe(strictBudget);
    expect(result.selectedMemories.length).toBeGreaterThan(0);
    expect(result.selectedMemories.length).toBeLessThan(10); // Not all 10 memories could fit
  });

  test('MEM-5: ChatGPT Import parses custom instructions and raw memory bullets', async () => {
    // 1. JSON Custom Instructions
    const customInstructionsJson = JSON.stringify({
      about_user: 'I am a backend specialist who works primarily in Node.js and Postgres. Based in Singapore.',
      response_instructions: 'Keep answers extremely short. Never use introductory filler phrases like "Certainly!" or "Sure!".'
    });

    const resJson = await MemoryManager.importFromChatGPT(customInstructionsJson);
    expect(resJson.success).toBe(true);
    expect(resJson.count).toBe(2);

    const longTermMemories = await MemoryManager.listMemories({ type: MEMORY_TYPES.LONG_TERM });
    expect(longTermMemories.some(m => m.content.includes('Singapore'))).toBe(true);
    expect(longTermMemories.some(m => m.content.includes('filler phrases'))).toBe(true);

    // 2. Raw Text Bullets (from ChatGPT Personalization memory list)
    const rawBullets = `
      - User works at a fintech startup building payment orchestration
      - User prefers TypeScript over plain JavaScript
      - Active project is Wayfinder AI extension
    `;

    const resBullets = await MemoryManager.importFromChatGPT(rawBullets);
    expect(resBullets.success).toBe(true);
    expect(resBullets.count).toBe(3);

    const projectMemories = await MemoryManager.listMemories({ type: MEMORY_TYPES.PROJECT });
    expect(projectMemories.some(m => m.content.includes('Wayfinder AI'))).toBe(true);
  });

  test('MEM-6: Claude Import parses markdown project artifacts and instructions', async () => {
    const claudeMarkdown = `
# Project: Cloud Gateway Architecture
The gateway is built on Node.js and hosted on Railway with strict zero-secret exposure policies.

## User Preferences
Always include TypeScript definitions and adhere to strict error redacting filters.

## Domain Knowledge: AWS S3
Use pre-signed URLs with a 15-minute expiration window for all uploaded user media.
    `;

    const result = await MemoryManager.importFromClaude(claudeMarkdown, { defaultProject: 'Cloud Gateway' });
    expect(result.success).toBe(true);
    expect(result.count).toBe(3);

    const all = await MemoryManager.listMemories();
    expect(all.some(m => m.title.includes('Cloud Gateway Architecture'))).toBe(true);
    expect(all.some(m => m.title.includes('User Preferences'))).toBe(true);
    expect(all.some(m => m.title.includes('Domain Knowledge'))).toBe(true);
  });

  test('MEM-7: Export to JSON and Markdown produces valid backups and LLM system prompts', async () => {
    // Export JSON
    const jsonStr = await MemoryManager.exportToJSON();
    expect(typeof jsonStr).toBe('string');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.app).toBe('Wayfinder AI');
    expect(parsed.summary.totalMemories).toBeGreaterThan(0);
    expect(parsed.memories[MEMORY_TYPES.LONG_TERM]).toBeDefined();

    // Export Markdown
    const mdStr = await MemoryManager.exportToMarkdown();
    expect(typeof mdStr).toBe('string');
    expect(mdStr).toContain('# Wayfinder AI Context & Memory Export');
    expect(mdStr).toContain('## 1. User Profile & Core Directives');
    expect(mdStr).toContain('## 2. Project Memory');
    expect(mdStr).toContain('## 3. Tool & Domain Knowledge');
  });

  test('MEM-8: Formatted Prompt Injection synthesizes valid XML/Markdown for LLMs', async () => {
    const context = await MemoryManager.retrieveContext({
      query: 'How to deploy and verify changes?',
      pageContext: { domain: 'railway.app', title: 'Railway Project Dashboard' },
      activeProject: 'Wayfinder AI'
    });

    expect(context.formattedPrompt).toContain('<user_memory_and_context>');
    expect(context.formattedPrompt).toContain('</user_memory_and_context>');
    expect(context.formattedPrompt).toContain('## Core User Directives & Preferences:');
    expect(context.formattedPrompt).toContain('## Active Project Memory');
  });

});
