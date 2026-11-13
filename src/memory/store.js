/**
 * Wayfinder AI — Multi-Tier Memory Store
 * Manages partitioned in-memory and persistent Chrome storage for memories and configuration.
 */

import {
  MEMORY_STORAGE_KEY,
  CONFIG_STORAGE_KEY,
  MEMORY_TYPES,
  DEFAULT_CONFIG,
  DEFAULT_STARTER_MEMORIES
} from "./types.js";

let _inMemoryStore = null;
let _inMemoryConfig = null;

export class MemoryStore {
  /**
   * Helper: Get raw storage wrapper (Chrome Storage or in-memory fallback)
   */
  static async getRawStorage() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get([MEMORY_STORAGE_KEY, CONFIG_STORAGE_KEY]);
      return {
        store: data[MEMORY_STORAGE_KEY] || null,
        config: data[CONFIG_STORAGE_KEY] || null
      };
    }
    return {
      store: _inMemoryStore,
      config: _inMemoryConfig
    };
  }

  /**
   * Helper: Save raw storage wrapper
   */
  static async saveRawStorage(store, config) {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const payload = {};
      if (store !== undefined) payload[MEMORY_STORAGE_KEY] = store;
      if (config !== undefined) payload[CONFIG_STORAGE_KEY] = config;
      await chrome.storage.local.set(payload);
    } else {
      if (store !== undefined) _inMemoryStore = store;
      if (config !== undefined) _inMemoryConfig = config;
    }
  }

  /**
   * Initialize or retrieve entire memory store
   */
  static async getStore() {
    const { store } = await this.getRawStorage();
    if (!store) {
      const initialStore = {
        [MEMORY_TYPES.LONG_TERM]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.LONG_TERM),
        [MEMORY_TYPES.PROJECT]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.PROJECT),
        [MEMORY_TYPES.WORKING_CONTEXT]: [],
        [MEMORY_TYPES.KNOWLEDGE]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.KNOWLEDGE)
      };
      await this.saveRawStorage(initialStore, DEFAULT_CONFIG);
      return initialStore;
    }

    // Ensure all 4 partition keys exist
    for (const type of Object.values(MEMORY_TYPES)) {
      if (!Array.isArray(store[type])) {
        store[type] = [];
      }
    }
    return store;
  }

  /**
   * Get memory configuration
   */
  static async getConfig() {
    const { config } = await this.getRawStorage();
    return config ? { ...DEFAULT_CONFIG, ...config } : { ...DEFAULT_CONFIG };
  }

  /**
   * Update memory configuration
   */
  static async updateConfig(patch = {}) {
    const current = await this.getConfig();
    const updated = { ...current, ...patch };
    await this.saveRawStorage(undefined, updated);
    return updated;
  }

  /**
   * Add a new memory entry
   */
  static async addMemory({
    type = MEMORY_TYPES.LONG_TERM,
    title,
    content,
    category = "general",
    project = "Global",
    tags = [],
    domains = [],
    importance = 3,
    source = "manual"
  }) {
    if (!content || !content.trim()) {
      throw new Error("Memory content cannot be empty.");
    }

    const store = await this.getStore();
    const validatedType = Object.values(MEMORY_TYPES).includes(type) ? type : MEMORY_TYPES.LONG_TERM;

    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const newMemory = {
      id,
      type: validatedType,
      title: title ? title.trim() : content.trim().slice(0, 40) + "...",
      content: content.trim(),
      category: category.trim().toLowerCase(),
      project: project ? project.trim() : "Global",
      tags: Array.isArray(tags) ? tags.map(t => t.trim().toLowerCase()).filter(Boolean) : [],
      domains: Array.isArray(domains) ? domains.map(d => d.trim().toLowerCase()).filter(Boolean) : [],
      importance: Math.min(5, Math.max(1, Number(importance) || 3)),
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      source
    };

    store[validatedType].unshift(newMemory);
    await this.saveRawStorage(store, undefined);
    return newMemory;
  }

  /**
   * Update an existing memory
   */
  static async updateMemory(id, patch = {}) {
    const store = await this.getStore();
    let found = null;

    for (const type of Object.values(MEMORY_TYPES)) {
      const idx = store[type].findIndex(m => m.id === id);
      if (idx !== -1) {
        const targetType = patch.type && Object.values(MEMORY_TYPES).includes(patch.type)
          ? patch.type
          : type;

        const updated = {
          ...store[type][idx],
          ...patch,
          id,
          updatedAt: Date.now()
        };

        if (targetType === type) {
          store[type][idx] = updated;
        } else {
          store[type].splice(idx, 1);
          store[targetType].unshift(updated);
        }

        found = updated;
        break;
      }
    }

    if (!found) {
      throw new Error(`Memory with ID "${id}" not found.`);
    }

    await this.saveRawStorage(store, undefined);
    return found;
  }

  /**
   * Delete a memory entry by ID
   */
  static async deleteMemory(id) {
    const store = await this.getStore();
    let deleted = false;

    for (const type of Object.values(MEMORY_TYPES)) {
      const initialLen = store[type].length;
      store[type] = store[type].filter(m => m.id !== id);
      if (store[type].length < initialLen) {
        deleted = true;
      }
    }

    if (deleted) {
      await this.saveRawStorage(store, undefined);
    }
    return deleted;
  }

  /**
   * Retrieve all memories, optionally filtered
   */
  static async listMemories({ type, project, tag, search } = {}) {
    const store = await this.getStore();
    let results = [];

    const typesToInspect = type && store[type] ? [type] : Object.values(MEMORY_TYPES);
    for (const t of typesToInspect) {
      results.push(...store[t]);
    }

    if (project && project !== "All") {
      const pLower = project.toLowerCase();
      results = results.filter(m => m.project.toLowerCase() === pLower || m.project.toLowerCase() === "global");
    }

    if (tag) {
      const tLower = tag.toLowerCase();
      results = results.filter(m => m.tags.includes(tLower));
    }

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.tags.some(t => t.includes(q))
      );
    }

    return results.sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt);
  }

  /**
   * Reset memories back to default starter set
   */
  static async resetToDefaults() {
    const initialStore = {
      [MEMORY_TYPES.LONG_TERM]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.LONG_TERM),
      [MEMORY_TYPES.PROJECT]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.PROJECT),
      [MEMORY_TYPES.WORKING_CONTEXT]: [],
      [MEMORY_TYPES.KNOWLEDGE]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.KNOWLEDGE)
    };
    await this.saveRawStorage(initialStore, DEFAULT_CONFIG);
    return initialStore;
  }

  /**
   * Clear all memories (or a specific type)
   */
  static async clearAll(type = null) {
    const store = await this.getStore();
    if (type && store[type]) {
      store[type] = [];
    } else {
      for (const t of Object.values(MEMORY_TYPES)) {
        store[t] = [];
      }
    }
    await this.saveRawStorage(store, undefined);
    return true;
  }
}
