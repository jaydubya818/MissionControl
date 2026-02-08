/**
 * Project Memory — Tier 2
 * 
 * Medium-lived memory scoped to a project.
 * Manages WORKING.md documents and daily notes.
 * 
 * WORKING.md: The agent's current understanding of the project.
 *   - Updated after each completed task
 *   - Contains architectural decisions, conventions, known issues
 *   - Read at the start of each new task for context
 * 
 * Daily Notes: Running log of what happened each day.
 *   - Appended to throughout the day
 *   - Used for standup reports and context recovery
 */

export interface WorkingDoc {
  agentId: string;
  projectId: string;
  content: string;
  lastUpdated: number;
  sections: WorkingDocSection[];
}

export interface WorkingDocSection {
  heading: string;
  content: string;
}

export interface DailyNote {
  agentId: string;
  date: string; // YYYY-MM-DD
  entries: DailyNoteEntry[];
}

export interface DailyNoteEntry {
  timestamp: number;
  action: string;
  details: string;
}

export class ProjectMemory {
  private workingDoc: WorkingDoc;
  private dailyNote: DailyNote;
  
  constructor(agentId: string, projectId: string) {
    const today = new Date().toISOString().split("T")[0];
    
    this.workingDoc = {
      agentId,
      projectId,
      content: "",
      lastUpdated: Date.now(),
      sections: [],
    };
    
    this.dailyNote = {
      agentId,
      date: today,
      entries: [],
    };
  }
  
  // ========================================================================
  // WORKING.md
  // ========================================================================
  
  /**
   * Load WORKING.md content from Convex (or initialize empty).
   */
  loadWorkingDoc(content: string): void {
    this.workingDoc.content = content;
    this.workingDoc.sections = parseWorkingDoc(content);
    this.workingDoc.lastUpdated = Date.now();
  }
  
  /**
   * Get the full WORKING.md content.
   */
  getWorkingDoc(): string {
    return this.workingDoc.content;
  }
  
  /**
   * Get a specific section from WORKING.md.
   */
  getSection(heading: string): string | null {
    const section = this.workingDoc.sections.find(
      (s) => s.heading.toLowerCase() === heading.toLowerCase()
    );
    return section?.content ?? null;
  }
  
  /**
   * Update or add a section in WORKING.md.
   */
  updateSection(heading: string, content: string): void {
    const idx = this.workingDoc.sections.findIndex(
      (s) => s.heading.toLowerCase() === heading.toLowerCase()
    );
    
    if (idx >= 0) {
      this.workingDoc.sections[idx].content = content;
    } else {
      this.workingDoc.sections.push({ heading, content });
    }
    
    this.workingDoc.content = serializeWorkingDoc(this.workingDoc.sections);
    this.workingDoc.lastUpdated = Date.now();
  }
  
  /**
   * Append to a section (or create if missing).
   */
  appendToSection(heading: string, text: string): void {
    const existing = this.getSection(heading);
    this.updateSection(heading, existing ? `${existing}\n${text}` : text);
  }
  
  // ========================================================================
  // Daily Notes
  // ========================================================================
  
  /**
   * Load daily note from Convex.
   */
  loadDailyNote(content: string): void {
    this.dailyNote.entries = parseDailyNote(content);
    // Ensure date is set from content or use today's date
    const dateMatch = content.match(/# Daily Note — (\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      this.dailyNote.date = dateMatch[1];
    } else {
      this.dailyNote.date = new Date().toISOString().split("T")[0];
    }
  }
  
  /**
   * Add an entry to today's daily note.
   */
  addDailyEntry(action: string, details: string): void {
    this.dailyNote.entries.push({
      timestamp: Date.now(),
      action,
      details,
    });
  }
  
  /**
   * Get serialized daily note content.
   */
  getDailyNoteContent(): string {
    return serializeDailyNote(this.dailyNote);
  }
  
  /**
   * Get today's daily note entries.
   */
  getDailyEntries(): DailyNoteEntry[] {
    return [...this.dailyNote.entries];
  }
}

// ============================================================================
// Serialization helpers
// ============================================================================

function parseWorkingDoc(content: string): WorkingDocSection[] {
  if (!content) return [];
  
  const sections: WorkingDocSection[] = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentContent: string[] = [];
  let preamble: string[] = [];
  let inPreamble = true;
  
  for (const line of lines) {
    if (line.startsWith("## ")) {
      inPreamble = false;
      // Save previous section
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join("\n").trim(),
        });
      }
      currentHeading = line.replace("## ", "").trim();
      currentContent = [];
    } else if (inPreamble) {
      preamble.push(line);
    } else {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join("\n").trim(),
    });
  }
  
  // Preserve preamble as a special section if it exists
  if (preamble.length > 0 && preamble.some((l) => l.trim())) {
    sections.unshift({
      heading: "_preamble",
      content: preamble.join("\n").trim(),
    });
  }
  
  return sections;
}

function serializeWorkingDoc(sections: WorkingDocSection[]): string {
  return sections
    .map((s) => `## ${s.heading}\n\n${s.content}`)
    .join("\n\n");
}

function parseDailyNote(content: string): DailyNoteEntry[] {
  if (!content) return [];
  
  const entries: DailyNoteEntry[] = [];
  const lines = content.split("\n");
  
  for (const line of lines) {
    // Match pattern with optional time suffix: "- [timestamp] **action**: details (time)"
    const match = line.match(/^- \[(\d+)\] \*\*(.+?)\*\*: (.+?)(?: \(.+?\))?$/);
    if (match) {
      entries.push({
        timestamp: parseInt(match[1], 10),
        action: match[2],
        details: match[3], // Excludes the time suffix
      });
    }
  }
  
  return entries;
}

function serializeDailyNote(note: DailyNote): string {
  const header = `# Daily Note — ${note.date}\n\n`;
  const body = note.entries
    .map((e) => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      return `- [${e.timestamp}] **${e.action}**: ${e.details} (${time})`;
    })
    .join("\n");
  
  return header + body;
}
