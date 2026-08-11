export type LatexQuestionType = "single" | "multiple" | "text" | "inline" | "true_false" | "ordering" | "drag_drop";
export type LatexPartNumber = 1 | 2 | 3;

const LATEX_PART_ROMAN: Record<LatexPartNumber, string> = { 1: "I", 2: "II", 3: "III" };
const LATEX_PART_TAIL: Record<LatexPartNumber, string> = {
  1: "Mỗi câu hỏi thí sinh chỉ chọn một phương án.",
  2: "Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.",
  3: "Thí sinh chỉ ghi đáp án vào ô trả lời.",
};

export function latexPartInstruction(part: LatexPartNumber, count: number) {
  return `PHẦN ${LATEX_PART_ROMAN[part]}. Thí sinh trả lời từ câu 1 đến câu ${count}. ${LATEX_PART_TAIL[part]}`;
}

export type LatexMatchingData = {
  leftItems: Array<{ value: string; label: string }>;
  rightItems: Array<{ value: string; label: string; matchIndex?: number }>;
};

export type ParsedLatexQuestion = {
  source: string;
  body: string;
  /** Set when the source starts this question with a \phan1/2/3 marker. */
  part?: LatexPartNumber;
  prompt: string;
  questionType: LatexQuestionType;
  optionColumns: number;
  detectedCommands: string[];
  options: Array<{ value: string; label: string; correct?: boolean; order?: number }>;
  /** Present when the question uses the \match / \with ghép nối syntax. */
  matching?: LatexMatchingData;
  correctAnswer: string | string[];
  solution: string;
};

export type ParsedBaidoc = {
  source: string;
  heading: string;
  instruction: string;
  passage: string;
  questionSources: string[];
  questions: ParsedLatexQuestion[];
  questionEnvironmentCount: number;
  /** Inclusive question numbers occupied by this passage in the source. */
  questionStart: number;
  questionEnd: number;
  /** Source range of the selected (outermost question-bearing) baidoc block. */
  start?: number;
  end?: number;
};

export type ParsedBaidocQuestion = {
  source: string;
  passage: string | null;
  passageIndex?: number;
};

export const DEFAULT_BAIDOC_INSTRUCTION = "Dựa vào thông tin dưới đây và trả lời các câu hỏi từ câu {start} - {end}:";

type BraceGroup = { content: string; start: number; end: number };
type CommandInvocation = {
  commandIndex: number;
  end: number;
  /** End of the command's own syntax, before whitespace following it. */
  contentEnd: number;
  optional?: string;
  optionals?: string[];
  groups: BraceGroup[];
};
type ParsedChoiceOptions = {
  options: Array<{ value: string; label: string; correct?: boolean; order?: number }>;
  marker?: string;
  optionColumns?: number;
};

const EX_BEGIN_PATTERN = /\\begin\s*\{\s*ex\s*\}/gi;
const EX_END_PATTERN = /\\end\s*\{\s*ex\s*\}/gi;
const PHAN_PATTERN = /\\phan\s*(?:\{\s*)?([123])(?:\s*\})?(?![A-Za-z@0-9])/gi;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isEscaped(source: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function findMatchingBrace(source: string, openIndex: number) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (isEscaped(source, index)) continue;
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findMatchingSquare(source: string, openIndex: number) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (isEscaped(source, index)) continue;
    if (source[index] === "[") depth += 1;
    if (source[index] === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function skipWhitespace(source: string, from: number) {
  let cursor = from;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  return cursor;
}

function findCommandIndex(source: string, command: string, from = 0) {
  const pattern = new RegExp(`${escapeRegExp(command)}(?![A-Za-z@])`, "g");
  pattern.lastIndex = from;
  return pattern.exec(source)?.index ?? -1;
}

/** Read one command, its optional argument, and all immediate brace groups. */
function commandInvocation(source: string, command: string, from = 0): CommandInvocation | null {
  const commandIndex = findCommandIndex(source, command, from);
  if (commandIndex < 0) return null;
  let cursor = commandIndex + command.length;
  let contentEnd = cursor;
  cursor = skipWhitespace(source, cursor);

  const optionals: string[] = [];
  while (source[cursor] === "[") {
    const optionalEnd = findMatchingSquare(source, cursor);
    if (optionalEnd < 0) break;
    optionals.push(source.slice(cursor + 1, optionalEnd).trim());
    contentEnd = optionalEnd + 1;
    cursor = skipWhitespace(source, optionalEnd + 1);
  }

  const groups: BraceGroup[] = [];
  while (source[cursor] === "{") {
    const end = findMatchingBrace(source, cursor);
    if (end < 0) break;
    groups.push({ content: source.slice(cursor + 1, end), start: cursor, end });
    contentEnd = end + 1;
    cursor = skipWhitespace(source, end + 1);
  }
  return { commandIndex, end: cursor, contentEnd, optional: optionals[0], optionals, groups };
}

function allCommandInvocations(source: string, command: string) {
  const invocations: CommandInvocation[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const invocation = commandInvocation(source, command, cursor);
    if (!invocation) break;
    invocations.push(invocation);
    cursor = Math.max(invocation.end, invocation.commandIndex + command.length + 1);
  }
  return invocations;
}

function environmentBody(source: string, environment: string) {
  const startPattern = new RegExp(`\\\\begin\\s*\\{\\s*${escapeRegExp(environment)}\\s*\\}`, "i");
  const startMatch = startPattern.exec(source);
  if (!startMatch || startMatch.index === undefined) return null;
  const endPattern = new RegExp(`\\\\end\\s*\\{\\s*${escapeRegExp(environment)}\\s*\\}`, "i");
  endPattern.lastIndex = startMatch.index + startMatch[0].length;
  const endMatch = endPattern.exec(source);
  if (!endMatch || endMatch.index === undefined) return null;
  return {
    start: startMatch.index,
    end: endMatch.index + endMatch[0].length,
    body: source.slice(startMatch.index + startMatch[0].length, endMatch.index),
  };
}

type LatexPartMarker = { part: LatexPartNumber; start: number; end: number };

function partMarkerBefore(source: string, limit: number, lowerBound = 0): LatexPartMarker | null {
  const start = Math.max(0, lowerBound);
  const end = Math.max(start, limit);
  const matches = [...source.slice(start, end).matchAll(PHAN_PATTERN)];
  const match = matches.at(-1);
  if (!match || match.index === undefined) return null;
  return {
    part: Number(match[1]) as LatexPartNumber,
    start: start + match.index,
    end: start + match.index + match[0].length,
  };
}

function partMarkerForQuestionSource(source: string) {
  const beginMatch = source.match(EX_BEGIN_PATTERN);
  EX_BEGIN_PATTERN.lastIndex = 0;
  return partMarkerBefore(source, beginMatch?.index ?? source.length)?.part;
}

function canonicalPartMarker(part: LatexPartNumber) {
  return `\\phan${part}`;
}

function topLevelBraceGroups(source: string) {
  const groups: BraceGroup[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] === "%") {
      const lineEnd = source.indexOf("\n", cursor);
      cursor = lineEnd < 0 ? source.length : lineEnd + 1;
      continue;
    }
    cursor = skipWhitespace(source, cursor);
    if (cursor >= source.length) break;
    if (source[cursor] !== "{") {
      cursor += 1;
      continue;
    }
    const end = findMatchingBrace(source, cursor);
    if (end < 0) break;
    groups.push({ content: source.slice(cursor + 1, end), start: cursor, end });
    cursor = end + 1;
  }
  return groups;
}

const LATEX_LINE_BREAK = "\uE000";
/** Private markers used to carry tabular cell spanning through the text
 * normalizer until RichQuestionContent creates the actual HTML table cell. */
export const LATEX_TABLE_COLSPAN_START = "\uE004";
export const LATEX_TABLE_COLSPAN_END = "\uE005";
export const LATEX_TABLE_ALIGN_START = "\uE006";
export const LATEX_TABLE_ALIGN_END = "\uE007";
export const LATEX_TABLE_META_START = "\uE008";
export const LATEX_TABLE_META_END = "\uE009";
export const LATEX_TABLE_ROWSPAN_START = "\uE00C";
export const LATEX_TABLE_ROWSPAN_END = "\uE00D";
const TABULAR_RULE_START = "\uE00A";
const TABULAR_RULE_END = "\uE00B";
const LATEX_TEXT_LITERAL_CHARACTERS = new Set(["%", "&", "#", "_", "{", "}", "$"]);

/** Remove source-only comment lines without treating an inline `%` as a
 * comment. The editor accepts `%` as ordinary question text, so only the
 * conventional line form remains a comment. */
function stripLatexCommentLines(value: string) {
  return value
    .split("\n")
    .filter(line => !/^\s*%/.test(line))
    .join("\n");
}

/** Show LaTeX's escaped text punctuation as the literal character in the
 * browser preview. Raw punctuation is already safe to display as text. */
function unescapeLatexTextLiterals(value: string) {
  const normalizedCommands = value.replace(/\\textbackslash\s*\{\}/g, "\\");
  let result = "";
  for (let index = 0; index < normalizedCommands.length; index += 1) {
    const character = normalizedCommands[index];
    const next = normalizedCommands[index + 1];
    if (character === "\\" && next && LATEX_TEXT_LITERAL_CHARACTERS.has(next) && !isEscaped(normalizedCommands, index)) {
      result += next;
      index += 1;
      continue;
    }
    result += character;
  }
  return result;
}

/** The authoring shorthand `\vec{AB}` is rendered with the longer arrow
 * command so vectors keep the same appearance in every KaTeX surface. */
function normalizeVectorCommands(value: string) {
  return value.replace(/\\vec(?![A-Za-z@])/g, "\\overrightarrow");
}

/** Keep bare vector commands as math when a source omits `$...$` around them.
 * This is important for choice groups because they are normalized before the
 * question renderer receives their labels. */
function wrapBareVectorCommands(value: string) {
  let result = "";
  let index = 0;
  let inMath = false;
  while (index < value.length) {
    if (value.startsWith("$$", index)) {
      inMath = !inMath;
      result += "$$";
      index += 2;
      continue;
    }
    if (value[index] === "$") {
      inMath = !inMath;
      result += "$";
      index += 1;
      continue;
    }
    if (value.startsWith("\\(", index) || value.startsWith("\\[", index)) {
      inMath = true;
      result += value.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (value.startsWith("\\)", index) || value.startsWith("\\]", index)) {
      inMath = false;
      result += value.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (!inMath && (value.startsWith("\\vec", index) || value.startsWith("\\overrightarrow", index))) {
      const command = value.startsWith("\\overrightarrow", index) ? "\\overrightarrow" : "\\vec";
      let cursor = index + command.length;
      while (/\s/.test(value[cursor] || "")) cursor += 1;
      if (value[cursor] === "{") {
        const start = cursor;
        let depth = 0;
        while (cursor < value.length) {
          if (value[cursor] === "{") depth += 1;
          if (value[cursor] === "}") {
            depth -= 1;
            if (depth === 0) break;
          }
          cursor += 1;
        }
        if (depth === 0 && value[cursor] === "}") {
          result += `$\\overrightarrow${value.slice(start, cursor + 1)}$`;
          index = cursor + 1;
          continue;
        }
      }
    }
    result += value[index];
    index += 1;
  }
  return result;
}

/** Convert the common Vietnamese `\heva{...}` system macro into KaTeX's
 * supported cases environment, wrapping it in math when the source omitted
 * delimiters. */
function normalizeHevaCommands(value: string) {
  let result = "";
  let index = 0;
  let inMath = false;
  while (index < value.length) {
    if (value.startsWith("$$", index)) {
      inMath = !inMath;
      result += "$$";
      index += 2;
      continue;
    }
    if (value[index] === "$") {
      inMath = !inMath;
      result += "$";
      index += 1;
      continue;
    }
    const displayStart = !inMath && value.startsWith("\\displaystyle", index);
    const commandIndex = displayStart ? index + "\\displaystyle".length : index;
    let commandCursor = commandIndex;
    while (!inMath && /\s/.test(value[commandCursor] || "")) commandCursor += 1;
    if (value.startsWith("\\heva", commandCursor)) {
      let groupStart = commandCursor + "\\heva".length;
      while (/\s/.test(value[groupStart] || "")) groupStart += 1;
      if (value[groupStart] === "{") {
        const groupEnd = findMatchingBrace(value, groupStart);
        if (groupEnd >= 0) {
          const body = value.slice(groupStart + 1, groupEnd);
          result += `${inMath ? "" : "$"}${displayStart ? "\\displaystyle " : ""}\\begin{cases}${body}\\end{cases}${inMath ? "" : "$"}`;
          index = groupEnd + 1;
          continue;
        }
      }
    }
    result += value[index];
    index += 1;
  }
  return result;
}

export function alphabeticLabel(index: number, uppercase = false) {
  const first = uppercase ? 65 : 97;
  let value = "";
  let current = index + 1;
  while (current > 0) {
    current -= 1;
    value = String.fromCharCode(first + (current % 26)) + value;
    current = Math.floor(current / 26);
  }
  return value;
}

function romanLabel(index: number, uppercase = false) {
  const numerals: Array<[number, string]> = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let current = index + 1;
  let value = "";
  for (const [number, numeral] of numerals) {
    while (current >= number) {
      value += numeral;
      current -= number;
    }
  }
  return uppercase ? value.toUpperCase() : value;
}

function enumerateLabel(format: string | undefined, index: number) {
  const template = format?.trim() || "1.";
  const token = template.match(/[aAiI1]/)?.[0];
  if (!token) return template;
  const value = token === "a"
    ? alphabeticLabel(index)
    : token === "A"
      ? alphabeticLabel(index, true)
      : token === "i"
        ? romanLabel(index)
        : token === "I"
          ? romanLabel(index, true)
          : String(index + 1);
  return template.replace(token, value);
}

/** Convert common enumitem-style enumerate lists into the line-based content
 * format used by the web renderer. For example, `[a)]` becomes `a)`, `b)`.
 * Explicit `\\item[...]` labels still take precedence over the list format. */
function normalizeEnumerateEnvironments(value: string) {
  const beginPattern = /\\begin\s*\{\s*enumerate\s*\}\s*(?:\[([^\]]*)\])?/gi;
  const endPattern = /\\end\s*\{\s*enumerate\s*\}/gi;
  let result = "";
  let cursor = 0;
  let beginMatch: RegExpExecArray | null;
  while ((beginMatch = beginPattern.exec(value))) {
    const endSearchStart = beginPattern.lastIndex;
    endPattern.lastIndex = endSearchStart;
    const endMatch = endPattern.exec(value);
    if (!endMatch || endMatch.index < endSearchStart) break;
    const body = value.slice(endSearchStart, endMatch.index);
    let itemIndex = 0;
    // Consume the indentation/newline around each item. Keeping the source
    // newline as well as LATEX_LINE_BREAK would make every list item render
    // as two visual lines in the rich-content renderer.
    const renderedBody = body.replace(/\s*\\item(?:\s*\[([^\]]*)\])?\s*/gi, (_item, explicitLabel: string | undefined) => {
      const label = explicitLabel?.trim() || enumerateLabel(beginMatch?.[1], itemIndex);
      itemIndex += 1;
      return `${LATEX_LINE_BREAK}${label} `;
    });
    // The source line ending before `\\begin{enumerate}` is already the
    // block break represented by the first list-item marker. Remove trailing
    // source whitespace here so `abc\\n\\begin{enumerate}` cannot become
    // `abc\\n\\n- item` in the renderer.
    const prefix = value.slice(cursor, beginMatch.index).replace(/\s*$/, "");
    result += prefix + renderedBody.replace(/\s+$/, "");
    cursor = endMatch.index + endMatch[0].length;
    beginPattern.lastIndex = cursor;
  }
  return result + value.slice(cursor);
}

function protectAnswerLineBreaks(value: string) {
  // In TSA short-answer questions, each line containing an answer marker is a
  // separate statement even when the author did not add an explicit `\\`.
  return value.replace(
    /([^\n]*(?:\\(?:cham|shortans|SA)\b|____)[^\n]*)\n(?=\s*\S)/gi,
    (_, line: string) => `${line}${LATEX_LINE_BREAK}`,
  );
}

function replaceTextFormattingCommands(value: string) {
  const pattern = /\\(textit|emph|chuthich|textbf|indam|underline|text|mbox|hbox|textrm|textsf|texttt)\s*\{/gi;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const commandStart = match.index;
    const openIndex = commandStart + match[0].length - 1;
    const end = findMatchingBrace(value, openIndex);
    if (end < 0) break;
    result += value.slice(cursor, commandStart);
    const command = match[1].toLowerCase();
    let innerSource = value.slice(openIndex + 1, end);
    let consumedEnd = end + 1;
    // Be forgiving when a caption closes its outer brace immediately after
    // the last formula group: `...{v_1}}$}`. The `$` is clearly the missing
    // math closer and the final brace closes the caption command.
    if (command === "chuthich") {
      const trailingMathClose = value.slice(consumedEnd).match(/^\s*\$\s*\}/);
      const dollarCount = (innerSource.match(/\$/g) ?? []).length;
      if (trailingMathClose && dollarCount % 2 === 1) {
        innerSource += "$";
        consumedEnd += trailingMathClose[0].length;
      }
    }
    const normalizedInner = normalizeLatexContent(innerSource);
    const inner = command === "chuthich" ? promoteCaptionMath(normalizedInner) : normalizedInner;
    if (command === "textit" || command === "emph" || command === "chuthich") result += `*${inner}*`;
    else if (command === "textbf" || command === "indam") result += `**${inner}**`;
    else if (command === "underline") result += `__${inner}__`;
    else result += inner;
    cursor = consumedEnd;
    pattern.lastIndex = cursor;
  }
  return result + value.slice(cursor);
}

/** Captions often arrive from TeX sources as plain text followed by an
 * un-delimited `\displaystyle ...` expression. Promote that expression to
 * the `$...$` form understood by the rich-content renderer. Captions that
 * already use explicit math delimiters are left untouched. */
function promoteCaptionMath(value: string) {
  if (value.includes("$")) return value;
  const mathStart = value.search(/\\displaystyle\b/i);
  if (mathStart < 0) return value;
  const prefix = value.slice(0, mathStart).trimEnd();
  const expression = value.slice(mathStart).trim();
  return `${prefix}${prefix ? " " : ""}$${expression}$`;
}

function unwrapSingleBraceGroup(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && findMatchingBrace(trimmed, 0) === trimmed.length - 1) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function replaceImageRowCommands(value: string) {
  const invocations = allCommandInvocations(value, "\\anhhang");
  if (!invocations.length) return value;
  let result = "";
  let cursor = 0;
  for (const invocation of invocations) {
    const nestedEntries = invocation.groups.map(group => {
      const nestedGroups = topLevelBraceGroups(group.content);
      const trimmed = group.content.trim();
      if (nestedGroups.length !== 2 || !trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
      return {
        url: nestedGroups[0].content.trim(),
        caption: unwrapSingleBraceGroup(nestedGroups[1].content),
      };
    });
    const entries = nestedEntries.length >= 2 && nestedEntries.every(entry => entry?.url)
      ? nestedEntries.filter((entry): entry is { url: string; caption: string } => Boolean(entry?.url))
      : invocation.groups.map(group => ({ url: group.content.trim(), caption: "" })).filter(entry => entry.url);
    if (entries.length < 2) continue;
    const requestedColumns = Number(invocation.optional);
    const columns = Number.isFinite(requestedColumns) && requestedColumns >= 2
      ? Math.min(8, Math.floor(requestedColumns))
      : Math.min(8, entries.length);
    const requestedSize = invocation.optionals?.[1]?.match(/^(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)$/i);
    const width = requestedSize ? Math.min(1200, Math.max(80, Math.round(Number(requestedSize[1])))) : 0;
    const frameHeight = requestedSize ? Math.min(900, Math.max(40, Math.round(Number(requestedSize[2])))) : 0;
    const serializedEntries = entries
      .map(entry => `${encodeURIComponent(entry.url)}:${encodeURIComponent(entry.caption)}`)
      .join("|");
    result += value.slice(cursor, invocation.commandIndex);
    result += `$/image-row_{center}_{${columns}}_{${width}}_{${frameHeight}}_{${serializedEntries}}$`;
    cursor = invocation.contentEnd;
  }
  return result + value.slice(cursor);
}

function replaceImageCommands(value: string) {
  const invocations = allCommandInvocations(value, "\\chenanh");
  if (!invocations.length) return value;
  let result = "";
  let cursor = 0;
  for (const invocation of invocations) {
    const firstGroup = invocation.groups[0]?.content.trim() ?? "";
    const secondGroup = invocation.groups[1]?.content.trim() ?? "";
    const requestedScale = Number(firstGroup);
    const hasScale = invocation.groups.length >= 2 && Number.isFinite(requestedScale) && requestedScale > 0 && Boolean(secondGroup);
    const imageUrl = (hasScale ? secondGroup : firstGroup).trim();
    if (!imageUrl) continue;
    const option = invocation.optional?.trim().toLowerCase() ?? "";
    const align = ["left", "center", "right"].includes(option) ? option : "center";
    const scale = hasScale ? Math.min(2, Math.max(0.1, requestedScale)) : 1;
    const width = Math.min(100, Math.max(5, 65 * scale));
    result += value.slice(cursor, invocation.commandIndex);
    result += `$/image_{${imageUrl}}_{${align}}_{${width}}_{block}$`;
    cursor = invocation.contentEnd;
  }
  return result + value.slice(cursor);
}

function replaceRawImageUrls(value: string) {
  const pattern = /(?<!\{)((?:https?:\/\/|\/api\/(?:exam-images|images|guest-exams\/images)\/)[^\s{}]+?\.[a-z0-9][a-z0-9-]{0,15}(?:\?[^\s{}]*)?)(?=$|[\s])/gi;
  return value.replace(pattern, (_match, imageUrl: string) => `$/image_{${imageUrl}}_{center}_{65}_{block}$`);
}

/** Split a tabular body on LaTeX's top-level column and row separators. Row
 * separators inside nested math environments such as `cases`/`matrix` are
 * intentionally ignored. */
function splitTabularRows(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellStart = 0;
  let braceDepth = 0;
  let environmentDepth = 0;
  let index = 0;
  while (index < value.length) {
    if (value[index] === "\\" && !isEscaped(value, index)) {
      const begin = value.slice(index).match(/^\\begin\s*\{\s*[^{}]+\s*\}/i);
      if (begin) {
        environmentDepth += 1;
        index += begin[0].length;
        continue;
      }
      const end = value.slice(index).match(/^\\end\s*\{\s*[^{}]+\s*\}/i);
      if (end) {
        environmentDepth = Math.max(0, environmentDepth - 1);
        index += end[0].length;
        continue;
      }
      const rowBreak = value.slice(index).match(/^\\\\(?:\s*\[[^\]]*\])?/);
      if (rowBreak && environmentDepth === 0 && braceDepth === 0) {
        row.push(value.slice(cellStart, index));
        rows.push(row);
        row = [];
        index += rowBreak[0].length;
        cellStart = index;
        continue;
      }
    }
    if (value[index] === "&" && !isEscaped(value, index) && environmentDepth === 0 && braceDepth === 0) {
      row.push(value.slice(cellStart, index));
      cellStart = index + 1;
      index += 1;
      continue;
    }
    if (value[index] === "{" && !isEscaped(value, index)) braceDepth += 1;
    if (value[index] === "}" && !isEscaped(value, index)) braceDepth = Math.max(0, braceDepth - 1);
    index += 1;
  }
  row.push(value.slice(cellStart));
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function normalizeTabularAlignment(value: string | undefined) {
  const token = value?.trim().match(/[lcr]/i)?.[0]?.toLowerCase();
  return token === "c" ? "center" : token === "r" ? "right" : "left";
}

function parseTabularMulticolumn(value: string) {
  const trimmed = value.trim();
  const invocation = commandInvocation(trimmed, "\\multicolumn");
  const isComplete = invocation
    && invocation.commandIndex === 0
    && invocation.groups.length >= 3
    && invocation.contentEnd === trimmed.length;
  if (!isComplete) return null;
  return {
    colSpan: Math.max(1, Number(invocation.groups[0]?.content.trim()) || 1),
    alignment: normalizeTabularAlignment(invocation.groups[1]?.content),
    content: invocation.groups[2]?.content ?? "",
  };
}

function parseTabularMultirow(value: string) {
  const trimmed = value.trim();
  const invocation = commandInvocation(trimmed, "\\multirow");
  const isComplete = invocation
    && invocation.commandIndex === 0
    && invocation.groups.length >= 3
    && invocation.contentEnd === trimmed.length;
  if (!isComplete) return null;
  return {
    rowSpan: Math.max(1, Number(invocation.groups[0]?.content.trim()) || 1),
    content: invocation.groups[2]?.content ?? "",
  };
}

function tabularColumnStructure(spec: string) {
  const alignments: string[] = [];
  const verticalBoundaries: boolean[] = [];
  let index = 0;
  while (index < spec.length) {
    if (spec[index] === "|") {
      verticalBoundaries[alignments.length] = true;
      index += 1;
      continue;
    }
    if (spec[index] === "\\") {
      const command = spec.slice(index).match(/^\\[A-Za-z@]+/);
      index += command?.[0].length ?? 1;
      continue;
    }
    const token = spec[index]?.toLowerCase();
    if (token === "l" || token === "c" || token === "r") {
      alignments.push(normalizeTabularAlignment(token));
      index += 1;
      continue;
    }
    // p{}, m{} and b{} are width-bearing columns. Their content is not a
    // rendered alignment token, but they still occupy one logical column.
    if (token === "p" || token === "m" || token === "b") {
      alignments.push("left");
      index += 1;
      index = skipWhitespace(spec, index);
      if (spec[index] === "{") {
        const end = findMatchingBrace(spec, index);
        index = end >= 0 ? end + 1 : index + 1;
      }
      continue;
    }
    index += 1;
  }
  return { alignments, verticalBoundaries };
}

function normalizeTabularCell(value: string, defaultAlignment = "left") {
  const multicolumn = parseTabularMulticolumn(value);
  const colspan = multicolumn?.colSpan ?? 1;
  const multirow = parseTabularMultirow(multicolumn?.content ?? value.trim());
  const rowspan = multirow?.rowSpan ?? 1;
  const cellValue = multirow?.content ?? multicolumn?.content ?? value.trim();
  const alignment = multicolumn?.alignment ?? normalizeTabularAlignment(defaultAlignment);
  const normalized = cellValue
    .replace(/\\(?:hline|cline)\b(?:\s*\{[^{}]*\})?/gi, "")
    .replace(/\\(?:arraybackslash|tabularnewline)\b/gi, "")
    .replace(/\\&/g, "&")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
  return `${LATEX_TABLE_ALIGN_START}${alignment}${LATEX_TABLE_ALIGN_END}${rowspan > 1 ? `${LATEX_TABLE_ROWSPAN_START}${rowspan}${LATEX_TABLE_ROWSPAN_END}` : ""}${colspan > 1 ? `${LATEX_TABLE_COLSPAN_START}${colspan}${LATEX_TABLE_COLSPAN_END}` : ""}${normalized}`;
}

/** KaTeX does not implement the legacy eqnarray environment directly. Its
 * aligned environment has the same useful row/alignment semantics for exam
 * solutions, so normalize eqnarray/eqnarray* into one display-math block. */
function normalizeEqnarrayEnvironments(value: string) {
  const beginPattern = /\\begin\s*\{\s*eqnarray\*?\s*\}/gi;
  let result = "";
  let cursor = 0;
  let begin: RegExpExecArray | null;
  while ((begin = beginPattern.exec(value))) {
    const endPattern = /\\end\s*\{\s*eqnarray\*?\s*\}/gi;
    endPattern.lastIndex = beginPattern.lastIndex;
    const end = endPattern.exec(value);
    if (!end) break;
    const body = value.slice(beginPattern.lastIndex, end.index)
      .replace(/\\(?:nonumber|notag)\b/gi, "")
      .trim();
    result += value.slice(cursor, begin.index);
    result += `$$\\begin{aligned}${body}\\end{aligned}$$`;
    cursor = end.index + end[0].length;
    beginPattern.lastIndex = cursor;
  }
  return result + value.slice(cursor);
}

function markTabularRules(value: string) {
  return value
    .replace(/\\cline\s*\{\s*(\d+)\s*-\s*(\d+)\s*\}/gi, (_match, start: string, end: string) => `${TABULAR_RULE_START}${start}-${end}${TABULAR_RULE_END}`)
    .replace(/\\hline\b/gi, `${TABULAR_RULE_START}all${TABULAR_RULE_END}`);
}

function extractTabularRules(value: string) {
  const rules: string[] = [];
  let firstRuleAtStart = false;
  let seenRule = false;
  const pattern = new RegExp(`${escapeRegExp(TABULAR_RULE_START)}([^${escapeRegExp(TABULAR_RULE_END)}]+)${escapeRegExp(TABULAR_RULE_END)}`, "g");
  const content = value.replace(pattern, (_match, rule: string, offset: number) => {
    if (!seenRule) {
      firstRuleAtStart = !value.slice(0, offset).trim();
      seenRule = true;
    }
    rules.push(rule);
    return "";
  });
  return { content, rules, firstRuleAtStart };
}

function tabularRuleRange(value: string, columnCount: number) {
  if (value === "all") return { start: 0, end: columnCount };
  const match = value.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  return {
    start: Math.max(0, Number(match[1]) - 1),
    end: Math.min(columnCount, Math.max(Number(match[1]), Number(match[2]))),
  };
}

function findTabularEnd(source: string, contentStart: number) {
  const tokenPattern = /\\(?:begin|end)\s*\{\s*tabular\s*\}/gi;
  tokenPattern.lastIndex = contentStart;
  let depth = 1;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(source))) {
    if (/^\\begin/i.test(token[0])) {
      depth += 1;
      continue;
    }
    depth -= 1;
    if (depth === 0) return { start: token.index, end: token.index + token[0].length };
  }
  return null;
}

/** Convert a tabular environment into the markdown-table transport shape
 * already understood by RichQuestionContent while carrying the original
 * column topology, vertical rules and horizontal `hline`/`cline` rules in a
 * private metadata prefix. Cell content stays readable so math is still
 * normalized by the normal text/math pass below. */
function replaceTabularEnvironments(value: string) {
  const beginPattern = /\\begin\s*\{\s*tabular\s*\}/gi;
  let result = "";
  let cursor = 0;
  let begin: RegExpExecArray | null;
  while ((begin = beginPattern.exec(value))) {
    const specStart = skipWhitespace(value, beginPattern.lastIndex);
    if (value[specStart] !== "{") continue;
    const specEnd = findMatchingBrace(value, specStart);
    if (specEnd < 0) continue;
    const closing = findTabularEnd(value, specEnd + 1);
    if (!closing) break;
    const structure = tabularColumnStructure(value.slice(specStart + 1, specEnd));
    const rawRows = splitTabularRows(markTabularRules(value.slice(specEnd + 1, closing.start)));
    const topRuleValues: string[] = [];
    const afterRuleValues: string[][] = [];
    const cleanedRows: string[][] = [];
    rawRows.forEach(rawRow => {
      const extractedCells = rawRow.map(cell => extractTabularRules(cell));
      const cells = extractedCells.map(cell => cell.content);
      const rowRules = extractedCells.flatMap(cell => cell.rules);
      const hasContent = cells.some(cell => cell.trim()) || rawRow.length > 1;
      if (!hasContent) {
        if (rowRules.length && cleanedRows.length) afterRuleValues[cleanedRows.length - 1] = [...(afterRuleValues[cleanedRows.length - 1] ?? []), ...rowRules];
        return;
      }
      const firstRuleCell = extractedCells.findIndex(cell => cell.rules.length > 0);
      const firstRuleAtStart = firstRuleCell >= 0
        && extractedCells[firstRuleCell]?.firstRuleAtStart
        && !cells.slice(0, firstRuleCell).some(cell => cell.trim());
      if (rowRules.length) {
        if (firstRuleAtStart && cleanedRows.length) afterRuleValues[cleanedRows.length - 1] = [...(afterRuleValues[cleanedRows.length - 1] ?? []), ...rowRules];
        else if (firstRuleAtStart) topRuleValues.push(...rowRules);
        else afterRuleValues[cleanedRows.length] = [...(afterRuleValues[cleanedRows.length] ?? []), ...rowRules];
      }
      cleanedRows.push(cells);
    });
    const columnCount = Math.max(1, structure.alignments.length, ...cleanedRows.map(row => row.reduce((count, cell) => count + (parseTabularMulticolumn(cell)?.colSpan ?? 1), 0)));
    const alignments = [...structure.alignments];
    while (alignments.length < columnCount) alignments.push("left");
    const normalizedRows = cleanedRows.map(row => {
      let logicalColumn = 0;
      const normalized = row.map(cell => {
        const multicolumn = parseTabularMulticolumn(cell);
        const result = normalizeTabularCell(cell, alignments[logicalColumn] ?? "left");
        logicalColumn += multicolumn?.colSpan ?? 1;
        return result;
      });
      while (logicalColumn < columnCount) {
        normalized.push(normalizeTabularCell("", alignments[logicalColumn] ?? "left"));
        logicalColumn += 1;
      }
      return normalized;
    });
    if (!normalizedRows.length) continue;
    const metadata = {
      version: 1,
      columnCount,
      alignments,
      verticalBoundaries: Array.from({ length: columnCount + 1 }, (_, index) => Boolean(structure.verticalBoundaries[index])),
      topRules: topRuleValues.map(rule => tabularRuleRange(rule, columnCount)).filter(Boolean),
      rulesAfter: normalizedRows.map((_, rowIndex) => (afterRuleValues[rowIndex] ?? []).map(rule => tabularRuleRange(rule, columnCount)).filter(Boolean)),
    };
    const metadataToken = `${LATEX_TABLE_META_START}${encodeURIComponent(JSON.stringify(metadata))}${LATEX_TABLE_META_END}`;
    const markdownTable = [
      `| ${metadataToken}${normalizedRows[0].join(" | ")} |`,
      `| ${normalizedRows[0].map(() => "---").join(" | ")} |`,
      ...normalizedRows.slice(1).map(row => `| ${row.join(" | ")} |`),
    ].join("\n");
    result += value.slice(cursor, begin.index) + markdownTable;
    cursor = closing.end;
    beginPattern.lastIndex = cursor;
  }
  return result + value.slice(cursor);
}

function normalizeTextSegment(value: string) {
  const text = unescapeLatexTextLiterals(replaceRawImageUrls(replaceImageCommands(replaceImageRowCommands(value)))
    .replace(/\r\n?/g, "\n"));
  return replaceTextFormattingCommands(text
    .replace(/\\dotlineans(?:\[[^\]]*\])?(?:\s*\{[^{}]*\})?/gi, "")
    .replace(/\\phantom\{[^{}]*\}/g, "")
    .replace(/\\(?:begin|end)\s*\{\s*(?:center|flushleft|flushright|noindent|itemize|enumerate|description)\s*\}(?:\s*\[[^\]]*\])?/gi, "")
    .replace(/\\(?:noindent|ignorespaces|unskip|centering)\b/gi, "")
    .replace(/\\(?:linebreak|newline|par)\b(?:\s*\[[^\]]*\])?/gi, LATEX_LINE_BREAK)
    .replace(/\\\\(?:\s*\[[^\]]*\])?/g, LATEX_LINE_BREAK)
    .replace(/\\item(?:\s*\[[^\]]*\])?/gi, `${LATEX_LINE_BREAK}• `)
    .replace(/\\(?:hline|hfill|quad|qquad|enspace)\b/gi, " ")
    .replace(/\\(?:hspace|vspace)\s*\{[^{}]*\}/gi, " ")
    .replace(/\\[,;:! ]/g, " ")
    .replace(/~/g, " "))
    // Keep source line breaks. Horizontal indentation and spacing are still
    // normalized, while `\\` and answer lines remain visible breaks.
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(new RegExp(`[ \\t]*${escapeRegExp(LATEX_LINE_BREAK)}[ \\t]*(?:\\n[ \\t]*)?`, "g"), "\n");
}

/** Convert the LaTeX text that the web renderer can represent while keeping
 * math blocks intact for KaTeX. Source newlines are whitespace; explicit
 * `\\`, `\\par`, `\\newline`, and `\\linebreak` become visible breaks. */
export function normalizeLatexContent(value: string) {
  value = normalizeEqnarrayEnvironments(normalizeVectorCommands(wrapBareVectorCommands(normalizeHevaCommands(value))));
  const source = replaceTabularEnvironments(stripLatexCommentLines(replaceImageRowCommands(replaceTextFormattingCommands(normalizeEnumerateEnvironments(protectAnswerLineBreaks(value
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, content: string) => `$$${content}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, content: string) => `$${content}$`)))))));
  const mathPattern = /\$\$[\s\S]*?\$\$|\$[^$]*\$/g;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = mathPattern.exec(source))) {
    result += normalizeTextSegment(source.slice(cursor, match.index));
    result += match[0].replace(/\r\n?/g, "\n");
    cursor = match.index + match[0].length;
  }
  result += normalizeTextSegment(source.slice(cursor));
  return result.trim();
}

/** Render a raw LaTeX answer (for example `\\frac{6}{25}`) as math without
 * changing the raw value used by the answer key and scorer. */
export function formatLatexAnswerForDisplay(value: unknown): string | string[] {
  const formatOne = (item: unknown) => {
    const text = normalizeVectorCommands(String(item ?? "").trim().replace(/\{\s*,\s*\}/g, ","));
    if (!text || /^\s*(?:\$\$[\s\S]*\$\$|\$[\s\S]*\$|\\\([\s\S]*\\\)|\\\[[\s\S]*\\\])\s*$/.test(text)) return text;
    return /^\\[A-Za-z@]+/.test(text) ? `$${text}$` : unescapeLatexTextLiterals(text);
  };
  return Array.isArray(value) ? value.map(formatOne) : formatOne(value);
}

function stripLatexMarker(value: string) {
  return normalizeLatexContent(value
    .replace(/^\s*\\(?:True|False)\b\s*/i, "")
    .replace(/^\s*\\item\s*(?:\[[^\]]*\])?\s*/i, ""));
}

function cleanPrompt(value: string) {
  return normalizeLatexContent(value);
}

function hasCommand(source: string, command: string) {
  if (command === "listKT") return /\blistKT\b/i.test(source);
  return findCommandIndex(source, command) >= 0;
}

function extractBody(source: string) {
  const startMatch = EX_BEGIN_PATTERN.exec(source);
  EX_BEGIN_PATTERN.lastIndex = 0;
  EX_END_PATTERN.lastIndex = 0;
  const endMatches = [...source.matchAll(EX_END_PATTERN)];
  EX_END_PATTERN.lastIndex = 0;
  const start = startMatch?.index ?? -1;
  const endMatch = endMatches.at(-1);
  const end = endMatch?.index ?? -1;
  if (start < 0 || end < 0 || end <= start) return source.trim();
  return source.slice(start + (startMatch?.[0].length ?? 0), end).trim();
}

function bodyBeforeSolution(body: string) {
  const solutionIndex = findCommandIndex(body, "\\loigiai");
  return solutionIndex >= 0 ? body.slice(0, solutionIndex) : body;
}

function extractSolution(body: string) {
  const invocation = commandInvocation(body, "\\loigiai");
  return invocation?.groups[0] ? cleanPrompt(invocation.groups[0].content) : "";
}

function answerInvocations(body: string) {
  return ["\\cham", "\\shortans", "\\SA"]
    .flatMap(command => allCommandInvocations(body, command).map(invocation => ({ commandIndex: invocation.commandIndex, invocation })))
    .sort((left, right) => left.commandIndex - right.commandIndex)
    .map(item => item.invocation);
}

function answerValues(body: string) {
  return answerInvocations(body)
    .map(invocation => invocation.groups[0]?.content.trim() ?? "")
    .filter(Boolean);
}

function replaceAnswerCommandsWithBlanks(value: string) {
  const ranges = answerInvocations(value)
    .sort((left, right) => left.commandIndex - right.commandIndex);
  if (!ranges.length) return value;
  let result = "";
  let cursor = 0;
  for (const invocation of ranges) {
    result += value.slice(cursor, invocation.commandIndex);
    result += "____";
    cursor = invocation.contentEnd;
  }
  return result + value.slice(cursor);
}

function isTrueMarker(value: string) {
  return /(^|\s)\\True(?![A-Za-z@])/i.test(value);
}

function parseChoiceOptions(body: string, command: string): ParsedChoiceOptions {
  const invocation = commandInvocation(body, command);
  if (!invocation) return { options: [] };
  let groups = invocation.groups;
  let marker = "";
  if (command === "\\choice" && groups[0]?.content.trim().toLowerCase() === "multi") {
    marker = "multi";
    groups = groups.slice(1);
  }
  return {
    marker,
    optionColumns: [1, 2, 3, 4].includes(Number(invocation.optional)) ? Number(invocation.optional) : undefined,
    options: groups.map((group, index) => ({
      value: String.fromCharCode(65 + index),
      label: stripLatexMarker(group.content),
      correct: isTrueMarker(group.content),
    })),
  };
}

function parseChoiceSXMatching(body: string): LatexMatchingData | null {
  // The current TSA syntax uses \match/\with directly. Older source files
  // sometimes put an optional \choiceSX marker before the same pair; locate
  // the matching block itself so both forms share one renderer path.
  const matchIndex = findCommandIndex(body, "\\match");
  if (matchIndex < 0) return null;
  const matchInvocation = commandInvocation(body, "\\match", matchIndex);
  if (!matchInvocation) return null;
  const withIndex = findCommandIndex(body, "\\with", matchInvocation.end);
  if (withIndex < 0) return null;

  const leftItems = matchInvocation.groups.map((group, index) => ({
    value: String(index + 1),
    label: stripLatexMarker(group.content),
  }));
  const rightItems: LatexMatchingData["rightItems"] = [];
  let cursor = skipWhitespace(body, withIndex + "\\with".length);
  while (cursor < body.length) {
    let matchText = "";
    if (body[cursor] === "[") {
      const optionalEnd = findMatchingSquare(body, cursor);
      if (optionalEnd < 0) break;
      matchText = body.slice(cursor + 1, optionalEnd).trim();
      cursor = skipWhitespace(body, optionalEnd + 1);
    }
    if (body[cursor] !== "{") break;
    const end = findMatchingBrace(body, cursor);
    if (end < 0) break;
    const matchNumber = /^\d+$/.test(matchText) ? Number(matchText) : undefined;
    rightItems.push({
      value: alphabeticLabel(rightItems.length, true),
      label: stripLatexMarker(body.slice(cursor + 1, end)),
      matchIndex: matchNumber !== undefined && matchNumber > 0 ? matchNumber : undefined,
    });
    cursor = skipWhitespace(body, end + 1);
  }
  if (!leftItems.length || !rightItems.length) return null;
  return { leftItems, rightItems };
}

function choiceSXMatchingAnswer(matching: LatexMatchingData) {
  const answer = Array.from({ length: matching.leftItems.length }, () => "");
  matching.rightItems.forEach((right, rightIndex) => {
    const leftIndex = Number(right.matchIndex) - 1;
    if (leftIndex >= 0 && leftIndex < answer.length && !answer[leftIndex]) answer[leftIndex] = String(rightIndex + 1);
  });
  return answer;
}

export function matchingError(parsed: Pick<ParsedLatexQuestion, "questionType" | "options" | "matching" | "detectedCommands">) {
  if (parsed.detectedCommands.includes("\\choiceSX") && !parsed.matching) {
    return "Cú pháp \\choiceSX [số]{...} đã được bỏ. Hãy dùng \\match và \\with cho câu ghép nối.";
  }
  if (parsed.questionType !== "ordering") return "";
  if (!parsed.matching) return "Câu ghép nối cần có đủ \\match và \\with.";
  const leftCount = parsed.matching.leftItems.length;
  const referenced = parsed.matching.rightItems
    .map(item => item.matchIndex)
    .filter((value): value is number => Number.isInteger(value));
  if (leftCount < 2 || parsed.matching.rightItems.length < leftCount) return "Câu ghép nối cần ít nhất hai ý ở mỗi cột.";
  if (referenced.some(value => value < 1 || value > leftCount)) return `Chỉ mục trong \\with phải nằm từ [1] đến [${leftCount}].`;
  if (referenced.length !== leftCount || new Set(referenced).size !== leftCount) return "Mỗi ý ở \\match phải có đúng một phương án ghép trong \\with.";
  return "";
}

function parseItemChoices(source: string) {
  const itemPattern = /(?:^|\n)\s*\\item\s*(?:\[([^\]]*)\])?\s*/g;
  const matches = [...source.matchAll(itemPattern)];
  return matches.map((match, index) => {
    const matchStart = match.index ?? 0;
    const contentStart = matchStart + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? source.length;
    const itemLabel = match[1]?.trim();
    const content = source.slice(contentStart, contentEnd).trim();
    return { content: itemLabel ? `${itemLabel} ${content}` : content, start: matchStart, end: contentEnd };
  }).filter(item => item.content);
}

function choiceKTItems(body: string) {
  const invocation = commandInvocation(body, "\\choiceKT");
  if (!invocation) return { items: [] as string[], start: -1, end: -1 };
  if (invocation.groups.length) {
    return {
      items: invocation.groups.map(group => group.content),
      start: invocation.commandIndex,
      end: invocation.end,
    };
  }
  const boundary = findCommandIndex(body, "\\loigiai", invocation.end);
  const end = boundary >= 0 ? boundary : body.length;
  const items = parseItemChoices(body.slice(invocation.end, end));
  return { items: items.map(item => item.content), start: invocation.commandIndex, end: items.length ? end : invocation.end };
}

function listKTOptions(body: string) {
  const environment = environmentBody(body, "listKT");
  if (!environment) return [];
  return topLevelBraceGroups(environment.body).map((group, index) => ({
    value: String.fromCharCode(65 + index),
    label: stripLatexMarker(group.content),
  }));
}

export function normalizeLatexForMatch(value: string) {
  return normalizeLatexContent(value)
    .replace(/\$\$?/g, "")
    .replace(/\\(?:\(|\)|\[|\])/g, "")
    .replace(/\\(?:dfrac|tfrac)\b/gi, "\\frac")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\\(?:left|right)\b/g, "")
    .replace(/\\text\s*\{([^{}]*)\}/g, "$1")
    .replace(/\s+/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

function normalizedForMatch(value: string) {
  return normalizeLatexForMatch(value);
}

function resolveDragAnswers(values: string[], options: Array<{ value: string; label: string }>) {
  return values.map(value => {
    const normalized = normalizedForMatch(value);
    const matchingOption = options.find(option => normalizedForMatch(option.label) === normalized || option.value === value);
    if (matchingOption) return matchingOption.value;
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= options.length) return options[numeric - 1].value;
    return value;
  });
}

function dragPrompt(body: string) {
  const withoutSolution = bodyBeforeSolution(body);
  const environment = environmentBody(withoutSolution, "listKT");
  let working = environment
    ? `${withoutSolution.slice(0, environment.start)}${withoutSolution.slice(environment.end)}`
    : withoutSolution;
  const choices = choiceKTItems(working);
  if (choices.start >= 0 && choices.items.length) {
    const renderedItems = choices.items.map(item => replaceAnswerCommandsWithBlanks(item)).join("\n");
    working = `${working.slice(0, choices.start)}${renderedItems}${working.slice(choices.end)}`;
  } else {
    working = replaceAnswerCommandsWithBlanks(working);
  }
  return cleanPrompt(working);
}

function promptBeforeChoice(body: string) {
  const withoutSolution = bodyBeforeSolution(body);
  const indexes = ["\\choiceTF", "\\choiceTFt", "\\choiceTFn", "\\choiceSX", "\\match", "\\choiceKT", "\\choice"]
    .map(command => findCommandIndex(withoutSolution, command))
    .filter(index => index >= 0);
  const end = indexes.length ? Math.min(...indexes) : withoutSolution.length;
  return cleanPrompt(withoutSolution.slice(0, end));
}

function answerForOptions(options: Array<{ value: string; label: string; correct?: boolean; order?: number }>, type: LatexQuestionType) {
  const correct = options.filter(option => option.correct).map(option => option.value);
  if (type === "true_false") return options.map(option => option.correct ? "true" : "false");
  if (type === "multiple" || type === "drag_drop" || type === "inline") return correct;
  return correct[0] ?? "";
}

export function ensureExEnvironment(source: string) {
  const value = source.trim();
  if (!value) return "\\begin{ex}\n    % Nhập nội dung câu hỏi ở đây.\n\\end{ex}";
  const startMatch = EX_BEGIN_PATTERN.exec(value);
  EX_BEGIN_PATTERN.lastIndex = 0;
  const endMatches = [...value.matchAll(EX_END_PATTERN)];
  EX_END_PATTERN.lastIndex = 0;
  const start = startMatch?.index ?? -1;
  const endMatch = endMatches.at(-1);
  const end = endMatch?.index ?? -1;
  const part = partMarkerBefore(value, start >= 0 ? start : value.length)?.part;
  const prefix = part ? `${canonicalPartMarker(part)}\n` : "";
  if (start >= 0 && end > start) return `${prefix}${value.slice(start, end + (endMatch?.[0].length ?? 0)).trim()}`;
  return `${prefix}\\begin{ex}\n${value}\n\\end{ex}`;
}

/** Return every complete ex environment in a LaTeX document. */
export function splitLatexQuestions(input: string) {
  const starts = [...input.matchAll(EX_BEGIN_PATTERN)];
  EX_BEGIN_PATTERN.lastIndex = 0;
  if (!starts.length) return input.trim() ? [ensureExEnvironment(input)] : [];
  const questions: string[] = [];
  let previousEnd = 0;
  for (const startMatch of starts) {
    const start = startMatch.index ?? -1;
    if (start < 0) continue;
    EX_END_PATTERN.lastIndex = start + startMatch[0].length;
    const endMatch = EX_END_PATTERN.exec(input);
    EX_END_PATTERN.lastIndex = 0;
    if (!endMatch || endMatch.index <= start) continue;
    const marker = partMarkerBefore(input, start, previousEnd);
    const blockStart = marker?.start ?? start;
    questions.push(input.slice(blockStart, endMatch.index + endMatch[0].length).trim());
    previousEnd = endMatch.index + endMatch[0].length;
  }
  return questions;
}

type CompleteEnvironmentBlock = { source: string; start: number; end: number; body: string };
type NestedEnvironmentBlock = CompleteEnvironmentBlock & { depth: number };

function completeEnvironmentBlocks(input: string, environment: string, optionalArgument = false): CompleteEnvironmentBlock[] {
  const beginPattern = new RegExp(`\\\\begin\\s*\\{\\s*${escapeRegExp(environment)}\\s*\\}${optionalArgument ? "(?:\\s*\\[[^\\]]*\\])?" : ""}`, "gi");
  const endPattern = new RegExp(`\\\\end\\s*\\{\\s*${escapeRegExp(environment)}\\s*\\}`, "gi");
  const blocks: CompleteEnvironmentBlock[] = [];
  let beginMatch: RegExpExecArray | null;
  while ((beginMatch = beginPattern.exec(input))) {
    const start = beginMatch.index;
    endPattern.lastIndex = beginPattern.lastIndex;
    const endMatch = endPattern.exec(input);
    if (!endMatch || endMatch.index < beginPattern.lastIndex) break;
    const end = endMatch.index + endMatch[0].length;
    blocks.push({
      source: input.slice(start, end).trim(),
      start,
      end,
      body: input.slice(beginPattern.lastIndex, endMatch.index),
    });
    beginPattern.lastIndex = end;
  }
  return blocks;
}

function balancedEnvironmentBlocks(input: string, environment: string, optionalArgument = false): NestedEnvironmentBlock[] {
  const beginPattern = new RegExp(`\\\\begin\\s*\\{\\s*${escapeRegExp(environment)}\\s*\\}${optionalArgument ? "(?:\\s*\\[[^\\]]*\\])?" : ""}`, "gi");
  const endPattern = new RegExp(`\\\\end\\s*\\{\\s*${escapeRegExp(environment)}\\s*\\}`, "gi");
  const tokens = [
    ...[...input.matchAll(beginPattern)].map(match => ({ kind: "begin" as const, index: match.index ?? 0, text: match[0] })),
    ...[...input.matchAll(endPattern)].map(match => ({ kind: "end" as const, index: match.index ?? 0, text: match[0] })),
  ].sort((left, right) => left.index - right.index || (left.kind === "begin" ? -1 : 1));
  const stack: Array<{ start: number; contentStart: number; depth: number }> = [];
  const blocks: NestedEnvironmentBlock[] = [];
  for (const token of tokens) {
    if (token.kind === "begin") {
      stack.push({ start: token.index, contentStart: token.index + token.text.length, depth: stack.length });
      continue;
    }
    const opening = stack.pop();
    if (!opening) continue;
    const end = token.index + token.text.length;
    blocks.push({
      source: input.slice(opening.start, end).trim(),
      start: opening.start,
      end,
      body: input.slice(opening.contentStart, token.index),
      depth: opening.depth,
    });
  }
  return blocks.sort((left, right) => left.start - right.start || right.depth - left.depth);
}

function removeRanges(input: string, ranges: Array<{ start: number; end: number }>) {
  if (!ranges.length) return input;
  let result = "";
  let cursor = 0;
  for (const range of [...ranges].sort((left, right) => left.start - right.start)) {
    if (range.start < cursor) continue;
    result += input.slice(cursor, range.start);
    cursor = range.end;
  }
  return result + input.slice(cursor);
}

function numberedBaidocItems(value: string) {
  let itemIndex = 0;
  let listDepth = 0;
  const tokenPattern = /\\(?:begin|end)\s*\{\s*(?:enumerate|itemize|description)\s*\}(?:\s*\[[^\]]*\])?|\\item(?:\s*\[([^\]]*)\])?/gi;
  return value.replace(tokenPattern, (itemToken, explicitLabel: string | undefined) => {
    if (/^\\begin\s*\{/i.test(itemToken)) {
      listDepth += 1;
      return itemToken;
    }
    if (/^\\end\s*\{/i.test(itemToken)) {
      listDepth = Math.max(0, listDepth - 1);
      return itemToken;
    }
    // Nested LaTeX lists own their \item labels. Leave them intact so the
    // enumerate normalizer can apply formats such as [1)], [a)], or [i)].
    if (listDepth > 0) return itemToken;
    if (explicitLabel !== undefined && !explicitLabel.trim()) return "\n";
    const label = explicitLabel?.trim() || `[${++itemIndex}]`;
    return `\n${label} `;
  });
}

function extractBaidocInstruction(value: string) {
  // The optional `\item[]` instruction may be followed by an optional
  // `\tenbaidoc` heading. The passage itself may contain a paragraph followed
  // by a list, so using the first `\begin{enumerate}` as the boundary would
  // incorrectly swallow that paragraph into the heading metadata.
  const headingIndex = findCommandIndex(value, "\\tenbaidoc");
  const beforeHeading = headingIndex >= 0 ? value.slice(0, headingIndex) : value;
  const itemPattern = /^\s*\\item\s*\[\s*\]\s*/i;
  const itemMatch = itemPattern.exec(beforeHeading);
  if (itemMatch) {
    if (headingIndex >= 0) {
      return {
        instruction: beforeHeading.slice(itemMatch[0].length).trim() || DEFAULT_BAIDOC_INSTRUCTION,
        body: value.slice(headingIndex).trim(),
        explicit: true,
      };
    }
    const lineEnd = value.indexOf("\n", itemMatch[0].length);
    return {
      instruction: value.slice(itemMatch[0].length, lineEnd < 0 ? value.length : lineEnd).trim() || DEFAULT_BAIDOC_INSTRUCTION,
      body: lineEnd < 0 ? "" : value.slice(lineEnd + 1).trim(),
      explicit: true,
    };
  }
  return { instruction: DEFAULT_BAIDOC_INSTRUCTION, body: value, explicit: false };
}

export function resolveBaidocQuestionRange(value: string, start: number, end: number) {
  return value
    .replace(/\{start\}/gi, String(start))
    .replace(/\{end\}/gi, String(end));
}

/** Parse the TSA_REMIX_PRO `baidoc` container while keeping its questions in order. */
export function parseBaidocDocument(input: string): ParsedBaidoc[] {
  const baidocBlocks = balancedEnvironmentBlocks(input, "baidoc", true);
  const allQuestionBlocks = completeEnvironmentBlocks(input, "ex");
  const questionBearingBlocks = baidocBlocks.filter(block => /\\begin\s*\{\s*ex\s*\}/i.test(block.body));
  const blocks = (questionBearingBlocks.length ? questionBearingBlocks : baidocBlocks.filter(block => block.depth === 0))
    .filter(block => !questionBearingBlocks.some(child => child !== block && child.start > block.start && child.end < block.end));
  return blocks.map((block) => {
    const extractedInstruction = extractBaidocInstruction(block.body);
    const wrapperInstructions = baidocBlocks
      .filter(wrapper => wrapper.start <= block.start && wrapper.end >= block.end)
      .sort((left, right) => left.start - right.start)
      .map(wrapper => extractBaidocInstruction(wrapper.body))
      .filter(result => result.explicit)
      .map(result => result.instruction.trim())
      .filter((instruction, index, values) => instruction && values.indexOf(instruction) === index);
    const effectiveInstruction = wrapperInstructions.join("\n") || extractedInstruction.instruction;
    const hasExplicitInstruction = wrapperInstructions.length > 0 || extractedInstruction.explicit;
    const headingInvocation = commandInvocation(extractedInstruction.body, "\\tenbaidoc");
    const heading = headingInvocation?.groups[0]?.content.trim() || "";
    let body = headingInvocation
      ? removeRanges(extractedInstruction.body, [{ start: headingInvocation.commandIndex, end: headingInvocation.contentEnd }])
      : extractedInstruction.body;
    const questionBlocks = completeEnvironmentBlocks(body, "ex");
    const questionMarkers = questionBlocks.map((question, index) => partMarkerBefore(body, question.start, questionBlocks[index - 1]?.end ?? 0));
    // A `\phan1` marker is commonly placed immediately before the baidoc
    // wrapper. It must still apply to the first ex inside that wrapper.
    const blockMarker = partMarkerBefore(input, block.start, blocks[blocks.indexOf(block) - 1]?.end ?? 0);
    const questionSources = questionBlocks.map((question, index) => {
      const marker = questionMarkers[index];
      const effectiveMarker = marker ?? (index === 0 ? blockMarker : null);
      return effectiveMarker ? `${canonicalPartMarker(effectiveMarker.part)}\n${question.source}` : question.source;
    });
    const questionStart = allQuestionBlocks.filter(question => question.end <= block.start).length + 1;
    const questionEnd = questionStart + questionSources.length - 1;
    const resolvedInstruction = questionSources.length
      ? resolveBaidocQuestionRange(effectiveInstruction, questionStart, questionEnd)
      : effectiveInstruction;
    body = removeRanges(body, questionBlocks.map((question, index) => ({
      start: questionMarkers[index]?.start ?? question.start,
      end: question.end,
    })));

    const citations = allCommandInvocations(body, "\\trich");
    const citationText = citations.map(citation => citation.groups[0]?.content.trim() ?? "").filter(Boolean);
    body = removeRanges(body, citations.map(citation => ({ start: citation.commandIndex, end: citation.contentEnd })));
    const citationSource = citationText.map(text => `\\trich{${text}}`).join("\n\n");
    body = numberedBaidocItems(`${body.trim()}${citationSource ? `\n\n${citationSource}` : ""}`).trim();

    const questions = questionSources.map(parseLatexQuestion);
    return {
      source: block.source,
      start: block.start,
      end: block.end,
      heading,
      instruction: resolvedInstruction,
      passage: [hasExplicitInstruction ? resolvedInstruction : "", heading, body].filter(Boolean).join("\n"),
      questionSources,
      questions,
      questionEnvironmentCount: (block.body.match(/\\begin\s*\{\s*ex\s*\}/gi) ?? []).length,
      questionStart,
      questionEnd,
    };
  });
}

/**
 * Parse a source that may contain both passage-wrapped and standalone `ex`
 * questions. A document editor can therefore introduce a `baidoc` around a
 * group of questions without making every other question in the section part
 * of that same passage.
 */
export function parseBaidocQuestionEntries(input: string): ParsedBaidocQuestion[] {
  const groups = parseBaidocDocument(input);
  const exBlocks = completeEnvironmentBlocks(input, "ex");
  const groupStates = groups.map((group, passageIndex) => ({
    group,
    passageIndex,
    exBlocks: exBlocks.filter(block => (group.start ?? -1) < block.start && block.end <= (group.end ?? -1)),
  }));
  let previousEnd = 0;

  return exBlocks.map(exBlock => {
    const containingGroups = groupStates
      .filter(state => (state.group.start ?? -1) < exBlock.start && exBlock.end <= (state.group.end ?? -1))
      .sort((left, right) => {
        const leftSize = (left.group.end ?? 0) - (left.group.start ?? 0);
        const rightSize = (right.group.end ?? 0) - (right.group.start ?? 0);
        return leftSize - rightSize;
      });
    const containing = containingGroups[0];
    if (containing) {
      const questionIndex = containing.exBlocks.findIndex(block => block.start === exBlock.start);
      const source = containing.group.questionSources[questionIndex] ?? exBlock.source;
      previousEnd = exBlock.end;
      return {
        source,
        passage: containing.group.passage.trim() || null,
        passageIndex: containing.passageIndex,
      };
    }

    const marker = partMarkerBefore(input, exBlock.start, previousEnd);
    const sourceStart = marker?.start ?? exBlock.start;
    previousEnd = exBlock.end;
    return { source: input.slice(sourceStart, exBlock.end).trim(), passage: null };
  });
}

export function parseLatexDocument(input: string) {
  return splitLatexQuestions(input).map(parseLatexQuestion);
}

/**
 * Resolve the active \phan marker for every question in source order. Authoring
 * stores the marker only on the first question of a part, so consumers must
 * carry it forward before applying a shuffled attempt snapshot.
 */
export function latexPartSequence<T extends { latex_source?: string | null }>(questions: readonly T[]) {
  let activePart: LatexPartNumber | undefined;
  return questions.map(question => {
    try {
      const marker = question.latex_source?.trim() ? parseLatexQuestion(question.latex_source).part : undefined;
      if (marker) activePart = marker;
    } catch {
      // Keep the previous structural part when one malformed question cannot
      // be parsed; the next explicit marker can still recover the sequence.
    }
    return activePart;
  });
}

export function parseLatexQuestion(input: string): ParsedLatexQuestion {
  const source = ensureExEnvironment(input);
  const body = extractBody(source);
  const part = partMarkerForQuestionSource(source);
  const questionBody = bodyBeforeSolution(body);
  const solution = extractSolution(body);
  const hasTrueFalse = ["\\choiceTF", "\\choiceTFt", "\\choiceTFn"].find(command => hasCommand(questionBody, command));
  const hasMatchingSyntax = hasCommand(questionBody, "\\match") && hasCommand(questionBody, "\\with");
  const hasChoiceSX = hasCommand(questionBody, "\\choiceSX");
  const matching = hasMatchingSyntax ? parseChoiceSXMatching(questionBody) : null;
  const hasDragDrop = hasCommand(questionBody, "listKT") || hasCommand(questionBody, "\\choiceKT");
  const hasShortAnswer = ["\\cham", "\\shortans", "\\SA"].some(command => hasCommand(questionBody, command));

  let questionType: LatexQuestionType = "text";
  let optionColumns = 1;
  let options: Array<{ value: string; label: string; correct?: boolean; order?: number }> = [];
  let choiceMarker = "";

  if (hasTrueFalse) {
    questionType = "true_false";
    options = parseChoiceOptions(questionBody, hasTrueFalse).options;
  } else if (matching) {
    questionType = "ordering";
    options = matching.leftItems.map(item => ({ value: item.value, label: item.label }));
  } else if (hasDragDrop) {
    questionType = "drag_drop";
    options = listKTOptions(questionBody);
  } else if (hasCommand(questionBody, "\\choice")) {
    const parsedChoice = parseChoiceOptions(questionBody, "\\choice");
    options = parsedChoice.options;
    optionColumns = parsedChoice.optionColumns ?? 1;
    choiceMarker = parsedChoice.marker ?? "";
    questionType = choiceMarker === "multi" || options.filter(option => option.correct).length > 1 ? "multiple" : "single";
  } else if (hasShortAnswer) {
    questionType = "text";
  } else if (/_{3,}/.test(questionBody)) {
    questionType = "inline";
  }

  const rawAnswers = answerValues(questionBody);
  const correctAnswer = matching
    ? choiceSXMatchingAnswer(matching)
    : questionType === "drag_drop"
    ? resolveDragAnswers(rawAnswers, options)
    : questionType === "text" && rawAnswers.length
      ? rawAnswers.length === 1 ? rawAnswers[0] : rawAnswers
      : answerForOptions(options, questionType);
  const prompt = questionType === "drag_drop"
    ? dragPrompt(body)
    : questionType === "text" || questionType === "inline"
      ? cleanPrompt(replaceAnswerCommandsWithBlanks(bodyBeforeSolution(body)))
      : promptBeforeChoice(body);
  const detectedCommands: string[] = [];
  const detect = (label: string, present: boolean) => { if (present && !detectedCommands.includes(label)) detectedCommands.push(label); };
  detect(hasTrueFalse ?? "\\choiceTF", Boolean(hasTrueFalse));
  detect("\\choiceSX", hasChoiceSX);
  detect("\\match", Boolean(matching));
  detect("\\with", Boolean(matching));
  detect("listKT", hasCommand(body, "listKT"));
  detect("\\choiceKT", hasCommand(body, "\\choiceKT"));
  detect("\\choice", hasCommand(body, "\\choice"));
  detect("\\cham", hasCommand(body, "\\cham"));
  detect("\\shortans", hasCommand(body, "\\shortans"));
  detect("\\SA", hasCommand(body, "\\SA"));
  detect("\\chenanh", hasCommand(body, "\\chenanh"));
  detect("\\anhhang", hasCommand(body, "\\anhhang"));
  detect("\\loigiai", hasCommand(body, "\\loigiai"));
  if (hasCommand(body, "\\dotlineans")) detectedCommands.push("\\dotlineans");
  return { source, body, part, prompt, questionType, optionColumns, detectedCommands, options, matching: matching ?? undefined, correctAnswer, solution };
}

export function questionToLatex(question: { prompt: string; question_type: LatexQuestionType; options?: Array<{ value?: string; label?: string; text?: string; order?: number }>; option_columns?: number; matching?: LatexMatchingData; }, answer?: string | string[], solution = "") {
  const options = (question.options ?? []).map((option, index) => ({
    value: option.value ?? String.fromCharCode(65 + index),
    label: option.label ?? option.text ?? "",
    order: option.order,
  }));
  const answers = Array.isArray(answer) ? answer : answer ? [answer] : [];
  const authoredColumns = [2, 3, 4].includes(Number(question.option_columns)) ? Number(question.option_columns) : null;
  const choiceCommand = `\\choice${authoredColumns ? `[${authoredColumns}]` : ""}`;
  const body = question.question_type === "text"
    ? `${question.prompt}\n\\cham{${answers[0] ?? ""}}`
    : question.question_type === "inline"
      ? question.prompt
      : question.question_type === "true_false"
        ? `\\choiceTF\n${options.map((option, index) => `    {${answers[index] === "true" ? "\\True " : ""}${option.label}}`).join("\n")}`
        : question.question_type === "ordering"
          ? question.matching
            ? `\\match\n${question.matching.leftItems.map(item => `    {${item.label}}`).join("\n")}\n\\with\n${question.matching.rightItems.map(item => `    ${item.matchIndex ? `[${item.matchIndex}]` : ""}{${item.label}}`).join("\n")}`
            : `\\match\n${options.map(option => `    {${option.label}}`).join("\n")}`
          : question.question_type === "drag_drop"
            ? (() => {
              let answerIndex = 0;
              const answerLabel = () => {
                const value = answers[answerIndex++] ?? "";
                return options.find(option => option.value === value)?.label ?? value;
              };
              const prompt = question.prompt.replace(/_{3,}/g, () => `\\cham{${answerLabel()}}`);
              return `\\begin{listKT}\n${options.map(option => `    {${option.label}}`).join("\n")}\n\\end{listKT}\n${prompt}`;
            })()
            : `${choiceCommand}${question.question_type === "multiple" ? "{multi}\n" : "\n"}${options.map(option => `    {${answers.includes(option.value) ? "\\True " : ""}${option.label}}`).join("\n")}`;
  return `\\begin{ex}\n    ${body.split("\n").join("\n    ")}\n    ${solution.trim() ? `\\loigiai{\n        ${solution.trim().split("\n").join("\n        ")}\n    }` : ""}\n\\end{ex}`.replace(/\n    \n/g, "\n");
}
