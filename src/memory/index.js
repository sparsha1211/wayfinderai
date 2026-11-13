/**
 * Wayfinder AI — Unified Memory & Context Management Engine
 *
 * Dedicated Directory Module:
 * - types.js: Schemas, constants & starter templates
 * - store.js: Partitioned multi-tier storage
 * - hybridRetriever.js: BM25 lexical, domain, project & token budget optimizer
 * - importers.js: ChatGPT & Claude context parsers
 * - exporters.js: JSON & Claude/ChatGPT Markdown exporters
 * - activityTracker.js: Search query & tab context auto-remember engine
 */

import { MEMORY_TYPES, DEFAULT_CONFIG } from "./types.js";
import { MemoryStore } from "./store.js";
import { HybridRetriever } from "./hybridRetriever.js";
import { MemoryImporters } from "./importers.js";
import { MemoryExporters } from "./exporters.js";
import { ActivityTracker } from "./activityTracker.js";

export { MEMORY_TYPES, DEFAULT_CONFIG };

export class MemoryManager {
  // Store delegations
  static getStore() {
    return MemoryStore.getStore();
  }

  static getConfig() {
    return MemoryStore.getConfig();
  }

  static updateConfig(patch) {
    return MemoryStore.updateConfig(patch);
  }

  static addMemory(params) {
    return MemoryStore.addMemory(params);
  }

  static updateMemory(id, patch) {
    return MemoryStore.updateMemory(id, patch);
  }

  static deleteMemory(id) {
    return MemoryStore.deleteMemory(id);
  }

  static listMemories(filters) {
    return MemoryStore.listMemories(filters);
  }

  static resetToDefaults() {
    return MemoryStore.resetToDefaults();
  }

  static clearAll(type) {
    return MemoryStore.clearAll(type);
  }

  // Token & Lexical helpers
  static estimateTokens(text) {
    return HybridRetriever.estimateTokens(text);
  }

  static _tokenize(text) {
    return HybridRetriever.tokenize(text);
  }

  // Retrieval delegation
  static retrieveContext(options) {
    return HybridRetriever.retrieveContext(options);
  }

  // Import delegations
  static importFromChatGPT(rawInput, options) {
    return MemoryImporters.importFromChatGPT(rawInput, options);
  }

  static importFromClaude(rawInput, options) {
    return MemoryImporters.importFromClaude(rawInput, options);
  }

  // Export delegations
  static exportToJSON() {
    return MemoryExporters.exportToJSON();
  }

  static exportToMarkdown() {
    return MemoryExporters.exportToMarkdown();
  }

  // Ephemeral working context & activity tracking
  static async recordWorkingContext(content, { title = "Active Context", tags = [], project = null } = {}) {
    const config = await this.getConfig();
    const activeProject = project || config.activeProject || "Global";

    return this.addMemory({
      type: MEMORY_TYPES.WORKING_CONTEXT,
      title,
      content,
      category: "session",
      project: activeProject,
      tags: [...tags, "working_context"],
      importance: 4,
      source: "auto_working_context"
    });
  }

  static recordActivity(payload) {
    return ActivityTracker.recordActivity(payload);
  }

  static extractSearchQuery(url) {
    return ActivityTracker.extractSearchQuery(url);
  }

  static generateBeneficialQueries(params) {
    return ActivityTracker.generateBeneficialQueries(params);
  }
}
