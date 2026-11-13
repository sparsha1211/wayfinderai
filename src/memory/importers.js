/**
 * Wayfinder AI — Importers for ChatGPT & Claude
 * Parses custom instructions, conversations.json, markdown project knowledge, and raw memory lists.
 */

import { MEMORY_TYPES } from "./types.js";
import { MemoryStore } from "./store.js";

export class MemoryImporters {
  /**
   * Import memories from ChatGPT
   * Accepts:
   * 1. ChatGPT raw memory bullet list / Custom Instructions text
   * 2. Exported ChatGPT `conversations.json` structure
   */
  static async importFromChatGPT(rawInput, { defaultProject = "Imported ChatGPT" } = {}) {
    if (!rawInput) throw new Error("No ChatGPT data provided.");
    const imported = [];

    // Case A: JSON format (conversations.json or custom instructions JSON)
    if (typeof rawInput === "object" || (typeof rawInput === "string" && (rawInput.trim().startsWith("{") || rawInput.trim().startsWith("[")))) {
      let data = rawInput;
      if (typeof rawInput === "string") {
        try {
          data = JSON.parse(rawInput);
        } catch (e) {
          data = null;
        }
      }

      if (data) {
        // Handle ChatGPT Custom Instructions export
        if (data.user_instructions || data.about_user || data.response_instructions) {
          if (data.about_user || data.user_instructions) {
            const mem = await MemoryStore.addMemory({
              type: MEMORY_TYPES.LONG_TERM,
              title: "ChatGPT Profile: About User",
              content: data.about_user || data.user_instructions,
              category: "bio",
              project: "Global",
              tags: ["chatgpt", "profile", "user-directive"],
              importance: 5,
              source: "chatgpt_import"
            });
            imported.push(mem);
          }
          if (data.response_instructions) {
            const mem = await MemoryStore.addMemory({
              type: MEMORY_TYPES.LONG_TERM,
              title: "ChatGPT Directives: Response Style",
              content: data.response_instructions,
              category: "preference",
              project: "Global",
              tags: ["chatgpt", "response-style", "communication"],
              importance: 4,
              source: "chatgpt_import"
            });
            imported.push(mem);
          }
          return { success: true, count: imported.length, imported };
        }

        // Handle array of conversations
        if (Array.isArray(data)) {
          for (const item of data.slice(0, 20)) {
            const title = item.title || "Untitled Conversation";
            let summaryText = "";
            if (item.mapping) {
              const nodes = Object.values(item.mapping);
              const userMsgs = nodes
                .map(n => n.message)
                .filter(m => m && m.author?.role === "user" && m.content?.parts?.[0])
                .map(m => m.content.parts[0]);
              if (userMsgs.length > 0) {
                summaryText = userMsgs.slice(0, 3).join("\n").slice(0, 500);
              }
            }

            if (summaryText) {
              const mem = await MemoryStore.addMemory({
                type: MEMORY_TYPES.PROJECT,
                title: `ChatGPT Topic: ${title}`,
                content: summaryText,
                category: "conversation_archive",
                project: defaultProject,
                tags: ["chatgpt", "conversation"],
                importance: 3,
                source: "chatgpt_import"
              });
              imported.push(mem);
            }
          }
          return { success: true, count: imported.length, imported };
        }
      }
    }

    // Case B: Raw text (copied from ChatGPT Settings -> Personalization -> Saved Memories)
    const textLines = String(rawInput)
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 5);

    for (const line of textLines) {
      const cleanLine = line.replace(/^[-*•\d.)\]\s]+/, "").trim();
      if (!cleanLine) continue;

      const lower = cleanLine.toLowerCase();
      let memType = MEMORY_TYPES.LONG_TERM;
      let category = "bio";
      let tags = ["chatgpt"];

      if (lower.includes("project") || lower.includes("building") || lower.includes("repo") || lower.includes("stack") || lower.includes("codebase")) {
        memType = MEMORY_TYPES.PROJECT;
        category = "project_context";
        tags.push("project");
      } else if (lower.includes("prefer") || lower.includes("never") || lower.includes("always") || lower.includes("style") || lower.includes("format")) {
        memType = MEMORY_TYPES.LONG_TERM;
        category = "preference";
        tags.push("preference");
      } else if (lower.includes("domain") || lower.includes("tool") || lower.includes("api") || lower.includes("gotcha") || lower.includes("url")) {
        memType = MEMORY_TYPES.KNOWLEDGE;
        category = "knowledge";
        tags.push("tool");
      }

      const mem = await MemoryStore.addMemory({
        type: memType,
        title: cleanLine.slice(0, 40) + (cleanLine.length > 40 ? "..." : ""),
        content: cleanLine,
        category,
        project: memType === MEMORY_TYPES.PROJECT ? defaultProject : "Global",
        tags,
        importance: 4,
        source: "chatgpt_import"
      });
      imported.push(mem);
    }

    return { success: true, count: imported.length, imported };
  }

  /**
   * Import memories from Claude
   * Accepts:
   * 1. Claude Project Knowledge markdown files / instructions
   * 2. Claude Custom Instructions
   */
  static async importFromClaude(rawInput, { defaultProject = "Imported Claude Project" } = {}) {
    if (!rawInput) throw new Error("No Claude data provided.");
    const imported = [];
    const text = String(rawInput).trim();

    if (text.includes("#")) {
      const sections = text.split(/(?=^#{1,3}\s+)/m);
      for (const sec of sections) {
        const lines = sec.trim().split("\n");
        const header = lines[0].replace(/^#{1,3}\s+/, "").trim();
        const body = lines.slice(1).join("\n").trim();

        if (!body) continue;

        const lowerHeader = header.toLowerCase();
        let type = MEMORY_TYPES.PROJECT;
        let category = "architecture";

        if (lowerHeader.includes("user") || lowerHeader.includes("about") || lowerHeader.includes("identity") || lowerHeader.includes("profile")) {
          type = MEMORY_TYPES.LONG_TERM;
          category = "bio";
        } else if (lowerHeader.includes("rule") || lowerHeader.includes("style") || lowerHeader.includes("instruction") || lowerHeader.includes("preference")) {
          type = MEMORY_TYPES.LONG_TERM;
          category = "rule";
        } else if (lowerHeader.includes("gotcha") || lowerHeader.includes("knowledge") || lowerHeader.includes("api") || lowerHeader.includes("reference")) {
          type = MEMORY_TYPES.KNOWLEDGE;
          category = "reference";
        }

        const mem = await MemoryStore.addMemory({
          type,
          title: header,
          content: body,
          category,
          project: type === MEMORY_TYPES.PROJECT ? (header || defaultProject) : "Global",
          tags: ["claude", type],
          importance: 4,
          source: "claude_import"
        });
        imported.push(mem);
      }

      if (imported.length > 0) {
        return { success: true, count: imported.length, imported };
      }
    }

    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 10);
    for (const p of paragraphs) {
      const clean = p.trim();
      const mem = await MemoryStore.addMemory({
        type: MEMORY_TYPES.PROJECT,
        title: clean.slice(0, 35) + "...",
        content: clean,
        category: "claude_artifact",
        project: defaultProject,
        tags: ["claude", "project_artifact"],
        importance: 3,
        source: "claude_import"
      });
      imported.push(mem);
    }

    return { success: true, count: imported.length, imported };
  }
}
