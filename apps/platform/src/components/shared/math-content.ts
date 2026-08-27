const EMPTY_EDITOR_PARAGRAPH = /<p(?:\s[^>]*)?>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/p>/gi;

export function normalizeEditorHtml(content: string) {
  return content.replace(EMPTY_EDITOR_PARAGRAPH, "").trim();
}
