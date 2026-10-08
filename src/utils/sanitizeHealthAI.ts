/**
 * Health AI Response Sanitization & Normalization
 * 
 * Converts AI responses and report text into clean, human-readable plain text.
 * Strips all visible Markdown formatting symbols (**, *, __, _, ###, ##, #, bullets,
 * blockquotes, backticks, horizontal rules, markdown links) and decorative unicode symbols/emojis.
 * 
 * Strictly preserves:
 * - Medical values, units, reference ranges, abnormal findings, urgency info
 * - Medical hyphens (e.g. COVID-19, follow-up, 0-10, 13.0-17.0, 10-20 minutes)
 * - Punctuation (periods, commas, colons, parentheses, percentages, slashes)
 * - Clean paragraph breaks and readable line structure
 */

/**
 * Sanitizes a Health AI response string to pure, clean text without Markdown or decorative symbols.
 */
export function sanitizeHealthAIResponse(rawText: string | null | undefined): string {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. Remove markdown code fences (```json ... ``` or ``` ...)
  text = text.replace(/^```[a-zA-Z]*\n?/gm, '');
  text = text.replace(/```$/gm, '');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/`/g, '');

  // 2. Remove markdown links [text](url) -> text, and images ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // 3. Remove horizontal rules (---, ***, ___)
  text = text.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '');

  // 4. Remove Markdown headers (#, ##, ###, ####, etc.) at line starts
  text = text.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');

  // 5. Remove Markdown blockquotes (> ) at line starts
  text = text.replace(/^[ \t]*>[ \t]?/gm, '');

  // 6. Remove bold/italic markdown markers while preserving internal text
  // ***bold italic*** or ___bold italic___
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
  text = text.replace(/___(.*?)___/g, '$1');
  // **bold** or __bold__
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/__(.*?)__/g, '$1');
  // *italic* or _italic_
  text = text.replace(/\*([^*\n]+)\*/g, '$1');
  text = text.replace(/(^|\s)_([^_\n]+)_(\s|$|[.,;:!?()])/g, '$1$2$3');

  // Remove any remaining dangling formatting asterisks or double asterisks
  text = text.replace(/\*\*/g, '');
  text = text.replace(/\*/g, '');

  // 7. Remove list bullets and numbered prefixes when they are only formatting at the beginning of lines
  // Bullets: -, +, *, •, ◦, ▪, ▫
  text = text.replace(/^[ \t]*[-+•◦▪▫][ \t]+/gm, '');
  // Numbered list prefixes: e.g. "1. ", "2) ", "1.  " at line start
  text = text.replace(/^[ \t]*\d{1,3}[.)][ \t]+/gm, '');

  // 8. Remove decorative symbols & emojis:
  // ✓ ✗ ✔ ✕ → ← ↑ ↓ ↔ ↕ ⚠ ⚠️ ❤️ 🩺 🔴 🟢 🟡 ❗ ❓ ❌ ⭐ ★ ☆ 📋 ✨ 💡 🔍 📌 🚨 ⚡ etc.
  const decorativeRegex = /[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2022}\u{25AA}\u{25AB}\u{25CF}\u{25CB}\u{25A0}\u{25A1}✓✗✔✕→←↑↓↔↕⚠❤️🩺🔴🟢🟡❗❓❌⭐★☆📋✨💡🔍📌🚨⚡]/gu;
  text = text.replace(decorativeRegex, '');

  // 9. Remove markdown escape slashes before punctuation (e.g. \* -> *, \_ -> _)
  text = text.replace(/\\([*#_~`>+\-[\]()])/g, '$1');

  // 10. Clean up extra spaces inside lines while preserving line structure
  const lines = text.split('\n').map((line) => {
    return line.replace(/[ \t]+/g, ' ').trim();
  });

  // 11. Normalize excessive empty lines (max 2 consecutive line breaks -> 1 blank line between paragraphs)
  const cleanedText = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleanedText;
}

/**
 * Sanitizes an array of Health AI strings (e.g. key_findings, what_to_do_next, etc.).
 */
export function sanitizeHealthAIList(items: (string | null | undefined)[] | null | undefined): string[] {
  if (!items || !Array.isArray(items)) return [];
  return items
    .map((item) => sanitizeHealthAIResponse(item))
    .filter((item) => item.length > 0);
}
