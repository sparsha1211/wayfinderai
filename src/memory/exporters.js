/**
 * Wayfinder AI — Exporters for JSON & Claude/ChatGPT Markdown
 */

import { MEMORY_TYPES } from "./types.js";
import { MemoryStore } from "./store.js";

export class MemoryExporters {
  /**
   * Export all memories as structured JSON
   */
  static async exportToJSON() {
    const store = await MemoryStore.getStore();
    const config = await MemoryStore.getConfig();

    const exportPayload = {
      version: "1.0.0",
      app: "Wayfinder AI",
      exportedAt: new Date().toISOString(),
      activeProject: config.activeProject,
      tokenBudget: config.defaultTokenBudget,
      memoryEnabled: config.memoryEnabled,
      autoRememberActivity: config.autoRememberActivity,
      summary: {
        totalMemories: Object.values(store).reduce((acc, list) => acc + list.length, 0),
        longTerm: store[MEMORY_TYPES.LONG_TERM].length,
        project: store[MEMORY_TYPES.PROJECT].length,
        workingContext: store[MEMORY_TYPES.WORKING_CONTEXT].length,
        knowledge: store[MEMORY_TYPES.KNOWLEDGE].length
      },
      memories: store
    };

    return JSON.stringify(exportPayload, null, 2);
  }

  /**
   * Export memories into standard Claude / ChatGPT Custom Instructions Markdown
   */
  static async exportToMarkdown() {
    const store = await MemoryStore.getStore();
    const config = await MemoryStore.getConfig();

    const lines = [
      `# Wayfinder AI Context & Memory Export`,
      `*Generated on ${new Date().toLocaleDateString()} for Claude / ChatGPT / Cursor Integration*\n`,
      `---\n`,
      `## 1. User Profile & Core Directives (Long-Term Memory)`
    ];

    if (store[MEMORY_TYPES.LONG_TERM].length === 0) {
      lines.push("*No long-term memories saved yet.*");
    } else {
      for (const m of store[MEMORY_TYPES.LONG_TERM]) {
        lines.push(`### ${m.title}`);
        lines.push(`${m.content}\n`);
      }
    }

    lines.push(`---\n## 2. Project Memory (Active Project: ${config.activeProject || "None"})`);
    if (store[MEMORY_TYPES.PROJECT].length === 0) {
      lines.push("*No project memories saved yet.*");
    } else {
      for (const m of store[MEMORY_TYPES.PROJECT]) {
        lines.push(`### [${m.project}] ${m.title}`);
        lines.push(`${m.content}\n`);
      }
    }

    lines.push(`---\n## 3. Tool & Domain Knowledge`);
    if (store[MEMORY_TYPES.KNOWLEDGE].length === 0) {
      lines.push("*No domain knowledge saved yet.*");
    } else {
      for (const m of store[MEMORY_TYPES.KNOWLEDGE]) {
        lines.push(`### ${m.title}${m.domains?.length ? ` (${m.domains.join(", ")})` : ""}`);
        lines.push(`${m.content}\n`);
      }
    }

    lines.push(`---\n## 4. Recent Working Context & Search Intent`);
    if (store[MEMORY_TYPES.WORKING_CONTEXT].length === 0) {
      lines.push("*No active working context items.*");
    } else {
      for (const m of store[MEMORY_TYPES.WORKING_CONTEXT]) {
        lines.push(`- ${m.content}`);
      }
    }

    return lines.join("\n");
  }
}
