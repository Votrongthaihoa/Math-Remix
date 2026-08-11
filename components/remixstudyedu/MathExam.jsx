import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import { authenticatedFetch } from "../../lib/auth-client";
import { alphabeticLabel, formatLatexAnswerForDisplay, LATEX_TABLE_ALIGN_END, LATEX_TABLE_ALIGN_START, LATEX_TABLE_COLSPAN_END, LATEX_TABLE_COLSPAN_START, LATEX_TABLE_META_END, LATEX_TABLE_META_START, LATEX_TABLE_ROWSPAN_END, LATEX_TABLE_ROWSPAN_START, normalizeLatexContent } from "../../lib/exam-latex";
import "katex/dist/katex.min.css";
import "./math-exam.css";

const LOCAL_IMAGE_ROOT = "/math-assets/";
const EXAM_PART_LABELS = {
  math: "Tư duy Toán học",
  reading: "Tư duy Đọc hiểu",
  science: "Tư duy Khoa học",
};

function formatClock(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatQuestionClock(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function startExamButtonFeedback(event) {
  const button = event.currentTarget;
  const reduceMotion = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!button.disabled && !reduceMotion && !button.classList.contains("is-click-animating")) {
    button.classList.remove("is-click-animating");
    void button.offsetWidth;
    button.classList.add("is-click-animating");
  }
}

function playExamButtonFeedback(event, action) {
  startExamButtonFeedback(event);
  action();
}

function clearExamButtonFeedback(event) {
  if (event.animationName === "tsa-review-button-click") {
    event.currentTarget.classList.remove("is-click-animating");
  }
}

function ExamIcon({ name, size = 20 }) {
  if (name === "bookmark") {
    return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.12 0H6.08c-.4 0-.79.13-1.104.37a1.9 1.9 0 0 0-.698.967h7.562c.34 0 .665.14.905.391.24.25.375.59.375.945v9.7l1.28.954V1.337c0-.355-.135-.695-.375-.946A1.253 1.253 0 0 0 13.12 0Z" /><path d="M10.56 2.673H2.88c-.34 0-.665.14-.905.391S1.6 3.655 1.6 4.01V16l5.12-3.818L11.84 16V4.01c0-.355-.135-.695-.375-.946a1.253 1.253 0 0 0-.905-.391Z" /></svg>;
  }
  const paths = {
    left: "m15 18-6-6 6-6",
    right: "m9 18 6-6-6-6",
    menu: "M4 6h16M4 12h16M4 18h16",
    close: "M6 6l12 12M18 6 6 18",
    check: "m5 12 4 4L19 6",
    image: "M4 4h16v16H4zM8 12l3 3 2-2 3 3m-8-7h.01",
    zoom: "M11 8v6M8 11h6M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    zoomOut: "M8 11h6m5 8-4.4-4.4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
    flipHorizontal: "M12 3v18M8 7H4v10h4m8-10h4v10h-4",
    flipVertical: "M3 12h18M7 8V4h10v4m-10 8v4h10v-4",
    rotateLeft: "M9 7H4V2m0 5a8 8 0 1 1-1 7",
    rotateRight: "M15 7h5V2m0 5a8 8 0 1 0 1 7",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

const PREVIEW_ICON_PATHS = {
  swap: ["M847.9 592H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h605.2L612.9 851c-4.1 5.2-.4 13 6.3 13h72.5c4.9 0 9.5-2.2 12.6-6.1l168.8-214.1c16.5-21 1.6-51.8-25.2-51.8zM872 356H266.8l144.3-183c4.1-5.2.4-13-6.3-13h-72.5c-4.9 0-9.5 2.2-12.6 6.1L150.9 380.2c-16.5 21-1.6 51.8 25.1 51.8h696c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8z"],
  rotateLeft: [
    "M672 418H144c-17.7 0-32 14.3-32 32v414c0 17.7 14.3 32 32 32h528c17.7 0 32-14.3 32-32V450c0-17.7-14.3-32-32-32zm-44 402H188V494h440v326z",
    "M819.3 328.5c-78.8-100.7-196-153.6-314.6-154.2l-.2-64c0-6.5-7.6-10.1-12.6-6.1l-128 101c-4 3.1-3.9 9.1 0 12.3L492 318.6c5.1 4 12.7.4 12.6-6.1v-63.9c12.9.1 25.9.9 38.8 2.5 42.1 5.2 82.1 18.2 119 38.7 38.1 21.2 71.2 49.7 98.4 84.3 27.1 34.7 46.7 73.7 58.1 115.8a325.95 325.95 0 016.5 140.9h74.9c14.8-103.6-11.3-213-81-302.3z",
  ],
  rotateRight: [
    "M480.5 251.2c13-1.6 25.9-2.4 38.8-2.5v63.9c0 6.5 7.5 10.1 12.6 6.1L660 217.6c4-3.2 4-9.2 0-12.3l-128-101c-5.1-4-12.6-.4-12.6 6.1l-.2 64c-118.6.5-235.8 53.4-314.6 154.2A399.75 399.75 0 00123.5 631h74.9c-.9-5.3-1.7-10.7-2.4-16.1-5.1-42.1-2.1-84.1 8.9-124.8 11.4-42.2 31-81.1 58.1-115.8 27.2-34.7 60.3-63.2 98.4-84.3 37-20.6 76.9-33.6 119.1-38.8z",
    "M880 418H352c-17.7 0-32 14.3-32 32v414c0 17.7 14.3 32 32 32h528c17.7 0 32-14.3 32-32V450c0-17.7-14.3-32-32-32zm-44 402H396V494h440v326z",
  ],
  zoomIn: ["M637 443H519V309c0-4.4-3.6-8-8-8h-60c-4.4 0-8 3.6-8 8v134H325c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h118v134c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V519h118c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8zm284 424L775 721c122.1-148.9 113.6-369.5-26-509-148-148.1-388.4-148.1-537 0-148.1 148.6-148.1 389 0 537 139.5 139.6 360.1 148.1 509 26l146 146c3.2 2.8 8.3 2.8 11 0l43-43c2.8-2.7 2.8-7.8 0-11zM696 696c-118.8 118.7-311.2 118.7-430 0-118.7-118.8-118.7-311.2 0-430 118.8-118.7 311.2-118.7 430 0 118.7 118.8 118.7 311.2 0 430z"],
  zoomOut: ["M637 443H325c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h312c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8zm284 424L775 721c122.1-148.9 113.6-369.5-26-509-148-148.1-388.4-148.1-537 0-148.1 148.6-148.1 389 0 537 139.5 139.6 360.1 148.1 509 26l146 146c3.2 2.8 8.3 2.8 11 0l43-43c2.8-2.7 2.8-7.8 0-11zM696 696c-118.8 118.7-311.2 118.7-430 0-118.7-118.8-118.7-311.2 0-430 118.8-118.7 311.2-118.7 430 0 118.7 118.8 118.7 311.2 0 430z"],
};

function PreviewIcon({ name, rotate = 0 }) {
  return <svg className="preview-ant-icon" viewBox="64 64 896 896" fill="currentColor" aria-hidden="true" style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}>{PREVIEW_ICON_PATHS[name].map((path) => <path d={path} key={path} />)}</svg>;
}

function MatchingArrowIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: 20, height: 20, boxSizing: "border-box" }}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
}

function MathToken({ value, displayStyle = false }) {
  const isDisplayMath = value.startsWith("$$") && value.endsWith("$$");
  const source = `${displayStyle || isDisplayMath ? "\\displaystyle " : ""}${value.slice(isDisplayMath ? 2 : 1, isDisplayMath ? -2 : -1)}`;
  let html;
  try {
    html = katex.renderToString(source, { throwOnError: false, displayMode: isDisplayMath, strict: "ignore" });
  } catch {
    html = source;
  }
  return <span className={`math-token ${isDisplayMath ? "math-token-display" : ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

function isPrivateExamImage(url) {
  if (url.startsWith("/api/exam-images/")) return true;
  if (typeof window === "undefined") return false;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/exam-images/");
  } catch {
    return false;
  }
}

export function isGuestExamImage(url) {
  if (url.startsWith("/api/guest-exams/images/")) return true;
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/api/guest-exams/images/")) return false;
    return parsed.hostname === "api.mathremix.pro.vn"
      || parsed.hostname === "mathremix.pro.vn"
      || parsed.hostname === "www.mathremix.pro.vn"
      || parsed.hostname === "localhost"
      || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function QuestionImage({ url, width, align = "left", display = "inline", rowColumns = 0 }) {
  const PREVIEW_MIN_SCALE = 1;
  const PREVIEW_MAX_SCALE = 6;
  const [failed, setFailed] = useState(false);
  const privateImage = isPrivateExamImage(url);
  const guestImage = isGuestExamImage(url);
  const protectedImage = privateImage || guestImage;
  const filename = url.split("/").pop() || "exam-image.webp";
  const fallbackSrc = url.startsWith("http") || url.startsWith("/") ? url : `${LOCAL_IMAGE_ROOT}${filename}`;
  const [src, setSrc] = useState(protectedImage ? "" : fallbackSrc);
  const [preview, setPreview] = useState(false);
  const [previewTransform, setPreviewTransform] = useState({ scale: 1, x: 0, y: 0, rotate: 0, flipX: 1, flipY: 1 });
  const [dragging, setDragging] = useState(false);
  const previewDialogRef = useRef(null);
  const previewCloseRef = useRef(null);
  const previewTriggerRef = useRef(null);
  const previewStageRef = useRef(null);
  const panPointerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    // Reset the image state whenever the author changes the source URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(false);
    if (!protectedImage) {
      setSrc(fallbackSrc);
      return () => undefined;
    }
    setSrc("");
    (async () => {
      try {
        const response = guestImage
          ? await fetch(url, {
            credentials: "include",
            headers: { accept: "image/*" },
            cache: "no-store",
          })
          : await authenticatedFetch(url, {
            headers: { accept: "image/*" },
            cache: "no-store",
          });
        if (!response.ok) throw new Error("image request failed");
        const blob = await response.blob();
        if (!blob.size) throw new Error("empty image");
        const nextUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setSrc(nextUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fallbackSrc, guestImage, protectedImage, url]);

  useEffect(() => {
    if (!preview) return undefined;
    const previouslyFocused = document.activeElement;
    const previewTrigger = previewTriggerRef.current;
    previewDialogRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPreview(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(previewDialogRef.current?.querySelectorAll("button:not(:disabled)") || [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
      else previewTrigger?.focus();
    };
  }, [preview]);
  const rowGap = 12;
  const imageWidth = rowColumns > 1
    ? `calc((100% - ${rowGap * (rowColumns - 1)}px) / ${rowColumns})`
    : `${Math.min(Number(width) || 45, 100)}%`;
  const wrapperWidth = rowColumns > 1
    ? `calc((100% - ${rowGap * (rowColumns - 1)}px) / ${rowColumns} + var(--question-image-control-space))`
    : `min(100%, calc(${imageWidth} + var(--question-image-control-space)))`;
  if (failed) {
    return <span className="missing-question-image" style={{ width: `${Math.min(Number(width) || 45, 100)}%` }} aria-label={`Ảnh minh họa chưa tải được: ${filename}`}><ExamIcon name="image" /><span>Ảnh minh họa chưa tải được</span><small>{filename}</small></span>;
  }
  if (!src) {
    return <span className="missing-question-image image-loading" style={{ width: `${Math.min(Number(width) || 45, 100)}%` }} aria-label="Đang tải ảnh minh họa"><ExamIcon name="image" /><span>Đang tải ảnh minh họa…</span></span>;
  }
  const resetPreviewTransform = () => {
    panPointerRef.current = null;
    setDragging(false);
    setPreviewTransform({ scale: PREVIEW_MIN_SCALE, x: 0, y: 0, rotate: 0, flipX: 1, flipY: 1 });
  };
  const updateScale = (delta) => setPreviewTransform((state) => {
    const scale = Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, Number((state.scale + delta).toFixed(2))));
    return { ...state, scale, ...(scale === PREVIEW_MIN_SCALE ? { x: 0, y: 0 } : {}) };
  });
  const zoomAtPoint = (event) => {
    event.preventDefault();
    const stage = previewStageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const pointerX = event.clientX - (bounds.left + bounds.width / 2);
    const pointerY = event.clientY - (bounds.top + bounds.height / 2);
    const factor = event.deltaY > 0 ? 0.88 : 1.12;
    setPreviewTransform((state) => {
      const scale = Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, Number((state.scale * factor).toFixed(2))));
      if (scale === PREVIEW_MIN_SCALE) return { ...state, scale, x: 0, y: 0 };
      const ratio = scale / state.scale;
      return {
        ...state,
        scale,
        x: Number((pointerX - (pointerX - state.x) * ratio).toFixed(2)),
        y: Number((pointerY - (pointerY - state.y) * ratio).toFixed(2)),
      };
    });
  };
  const startPan = (event) => {
    if (event.target === event.currentTarget) {
      setPreview(false);
      return;
    }
    if (event.button !== 0 || previewTransform.scale <= PREVIEW_MIN_SCALE) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panPointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
  };
  const movePan = (event) => {
    const pointer = panPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    setPreviewTransform((state) => ({ ...state, x: state.x + deltaX, y: state.y + deltaY }));
  };
  const endPan = (event) => {
    const pointer = panPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panPointerRef.current = null;
    setDragging(false);
  };
  return <>
    <span className={`question-image-wrap ${rowColumns > 1 ? "row-item" : display === "block" ? "block" : "inline"} align-${align}`} style={{ width: wrapperWidth }}>
      <span className="question-image-content"><img className="question-image" src={src} alt="Minh họa câu hỏi" onError={() => setFailed(true)} /></span>
      <button ref={previewTriggerRef} type="button" className="question-image-zoom" aria-label="Phóng to ảnh" aria-haspopup="dialog" aria-expanded={preview} data-tooltip="Phóng to ảnh" onClick={(event) => { event.stopPropagation(); resetPreviewTransform(); setPreview(true); }}><ExamIcon name="zoom" size={18} /></button>
    </span>
    {preview && <div ref={previewDialogRef} className="question-image-preview" role="dialog" aria-modal="true" aria-label="Xem trước ảnh" tabIndex={-1} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(false); }}>
      <button ref={previewCloseRef} type="button" className="question-image-preview-close" aria-label="Đóng ảnh" onClick={() => setPreview(false)}><ExamIcon name="close" /></button>
      <div ref={previewStageRef} className={`question-image-preview-stage ${previewTransform.scale > PREVIEW_MIN_SCALE ? "can-pan" : ""} ${dragging ? "is-panning" : ""}`} onWheel={zoomAtPoint} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
        <img src={src} alt="Ảnh xem trước" draggable="false" style={{ transform: `translate3d(${previewTransform.x}px, ${previewTransform.y}px, 0) rotate(${previewTransform.rotate}deg) scale(${previewTransform.scale * previewTransform.flipX}, ${previewTransform.scale * previewTransform.flipY})` }} />
      </div>
      <span className="question-image-preview-hint">Lăn chuột để zoom · Kéo để di chuyển</span>
      <div className="question-image-preview-toolbar" role="toolbar" aria-label="Công cụ xem ảnh">
        <button type="button" aria-label="Lật ảnh theo chiều dọc" onClick={() => setPreviewTransform((state) => ({ ...state, flipY: state.flipY * -1 }))}><PreviewIcon name="swap" rotate={90} /></button>
        <button type="button" aria-label="Lật ảnh theo chiều ngang" onClick={() => setPreviewTransform((state) => ({ ...state, flipX: state.flipX * -1 }))}><PreviewIcon name="swap" /></button>
        <button type="button" aria-label="Xoay ảnh sang trái" onClick={() => setPreviewTransform((state) => ({ ...state, rotate: state.rotate - 90 }))}><PreviewIcon name="rotateLeft" /></button>
        <button type="button" aria-label="Xoay ảnh sang phải" onClick={() => setPreviewTransform((state) => ({ ...state, rotate: state.rotate + 90 }))}><PreviewIcon name="rotateRight" /></button>
        <button type="button" aria-label="Thu nhỏ ảnh" disabled={previewTransform.scale <= 1} onClick={() => updateScale(-0.25)}><PreviewIcon name="zoomOut" /></button>
        <button type="button" aria-label="Phóng to ảnh xem trước" disabled={previewTransform.scale >= 3} onClick={() => updateScale(0.25)}><PreviewIcon name="zoomIn" /></button>
      </div>
    </div>}
  </>;
}

function decodeImageRowEntry(value) {
  if (value.startsWith("/") || /^https?:\/\//i.test(value)) return { url: value, caption: "" };
  const separator = value.indexOf(":");
  if (separator < 0) return { url: value, caption: "" };
  try {
    return {
      url: decodeURIComponent(value.slice(0, separator)),
      caption: decodeURIComponent(value.slice(separator + 1)),
    };
  } catch {
    return { url: value, caption: "" };
  }
}

function normalizeImageCaption(value) {
  const source = String(value || "").trim();
  return source ? normalizeLatexContent(`\\chuthich{${source}}`) : "";
}

function QuestionImageRow({ entries, columns, widthPx = 0, frameHeightPx = 0 }) {
  const safeColumns = Math.min(8, Math.max(2, Number(columns) || entries.length));
  const rowGap = 12;
  const defaultItemWidth = `calc((100% - ${rowGap * (safeColumns - 1)}px) / ${safeColumns})`;
  const itemWidth = Number(widthPx) > 0
    ? `min(calc(${Number(widthPx)}px + var(--question-image-control-space)), 100%)`
    : defaultItemWidth;
  return <div className={`question-image-row columns-${safeColumns}`}>
    {entries.map((entry, index) => <div className="question-image-row-item" key={`${entry.url}-${index}`} style={{ width: itemWidth, ...(Number(frameHeightPx) > 0 ? { "--question-image-frame-height": `${Number(frameHeightPx)}px` } : {}) }}>
      <QuestionImage url={entry.url} width="100" align="center" display="row" />
      {entry.caption && <span className="question-image-caption"><RichQuestionContent content={normalizeImageCaption(entry.caption)} inline /></span>}
    </div>)}
  </div>;
}

const RICH_CITATION_START = "\uE001";
const RICH_CITATION_END = "\uE002";
const RICH_CITATION_LINE_BREAK = "\uE003";

function matchingBraceIndex(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) slashCount += 1;
    if (slashCount % 2 === 1) continue;
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function replaceRichCitationCommands(source) {
  const pattern = /\\trich\s*\{/gi;
  let result = "";
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const openIndex = match.index + match[0].length - 1;
    const end = matchingBraceIndex(source, openIndex);
    if (end < 0) break;
    result += source.slice(cursor, match.index);
    const citation = source.slice(openIndex + 1, end)
      .replace(/\r?\n/g, RICH_CITATION_LINE_BREAK)
      .replace(/\\\\(?:\s*\[[^\]]*\])?/g, RICH_CITATION_LINE_BREAK);
    result += `${RICH_CITATION_START}${citation}${RICH_CITATION_END}`;
    cursor = end + 1;
    pattern.lastIndex = cursor;
  }
  return result + source.slice(cursor);
}

// Keep explicit line breaks inside a citation together while the passage is
// being split into paragraphs. They are restored immediately before the
// citation is rendered so the whole citation can remain one right-aligned
// block.
function protectRichCitationLineBreaks(source) {
  const pattern = /\\trich\s*\{/gi;
  let result = "";
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const openIndex = match.index + match[0].length - 1;
    const end = matchingBraceIndex(source, openIndex);
    if (end < 0) break;
    const citation = source.slice(openIndex + 1, end)
      .replace(/\r?\n/g, RICH_CITATION_LINE_BREAK)
      .replace(/\\\\(?:\s*\[[^\]]*\])?/g, RICH_CITATION_LINE_BREAK);
    result += source.slice(cursor, openIndex + 1) + citation + "}";
    cursor = end + 1;
    pattern.lastIndex = cursor;
  }
  return result + source.slice(cursor);
}

function restoreRichCitationLineBreaks(value) {
  return value.replaceAll(RICH_CITATION_LINE_BREAK, "\n");
}

function splitPassageLines(content) {
  const lines = [];
  let line = "";
  let braceDepth = 0;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) slashCount += 1;
    const escaped = slashCount % 2 === 1;
    if (character === "\n" && braceDepth === 0) {
      lines.push(line);
      line = "";
      continue;
    }
    line += character;
    if (!escaped && character === "{") braceDepth += 1;
    if (!escaped && character === "}") braceDepth = Math.max(0, braceDepth - 1);
  }
  lines.push(line);
  return lines;
}

export function RichQuestionContent({ content, renderBlank, paragraphBreaks = false, mathDisplayStyle = false, wrapParagraphs = false, inline = false }) {
  const normalizedContent = content.replace(/\n+$/g, "");
  const preparedContent = replaceRichCitationCommands(normalizedContent);
  const pattern = new RegExp(`(\\$\\/image-row_\\{[^}]+\\}_\\{[^}]*\\}_\\{[^}]*\\}_\\{[^}]*\\}_\\{[^}]+\\}\\$|\\$\\/image-row_\\{[^}]+\\}_\\{[^}]*\\}_\\{[^}]+\\}\\$|\\$\\/image_\\{[^}]+\\}_\\{[^}]*\\}_\\{[^}]*\\}_\\{[^}]*\\}\\$|\\$\\$[\\s\\S]*?\\$\\$|\\$[^$]+\\$|${RICH_CITATION_START}[\\s\\S]*?${RICH_CITATION_END}|____|__[^_\\n]+__|\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|\\n)`, "g");
  let blankIndex = 0;
  const renderTokens = (source, keyPrefix) => source.split(pattern).filter((token) => token !== "").map((token, index, tokens) => {
    const key = `${keyPrefix}-${index}`;
    if (token === "\n") {
      const previousToken = tokens[index - 1] || "";
      if ((previousToken.startsWith("$/image_") || previousToken.startsWith("$/image-row_")) && previousToken.endsWith("}$")) return null;
      return paragraphBreaks ? <React.Fragment key={key}><br /><br /></React.Fragment> : <br key={key} />;
    }
    if (token === "____") return <span key={key} className="inline-answer-slot">{renderBlank?.(blankIndex++)}</span>;
    if (token.startsWith(RICH_CITATION_START) && token.endsWith(RICH_CITATION_END)) {
      const citation = restoreRichCitationLineBreaks(token.slice(RICH_CITATION_START.length, -RICH_CITATION_END.length));
      return <span key={key} className="rich-question-citation">{renderTokens(citation, `${key}-citation`)}</span>;
    }
    if (token.startsWith("$/image-row_")) {
      const sizedMatch = token.match(/^\$\/image-row_\{([^}]*)\}_\{([^}]*)\}_\{([^}]*)\}_\{([^}]*)\}_\{([^}]*)\}\$$/);
      const legacyMatch = token.match(/^\$\/image-row_\{([^}]*)\}_\{([^}]*)\}_\{([^}]*)\}\$$/);
      const match = sizedMatch || legacyMatch;
      if (!match) return token;
      const entries = (sizedMatch ? match[5] : match[3]).split("|").map(item => decodeImageRowEntry(item.trim())).filter(entry => entry.url);
      return entries.length >= 2
        ? <QuestionImageRow key={key} entries={entries} columns={match[2]} widthPx={sizedMatch ? match[3] : 0} frameHeightPx={sizedMatch ? match[4] : 0} />
        : token;
    }
    if (token.startsWith("$/image_")) {
      const match = token.match(/^\$\/image_\{([^}]+)\}_\{([^}]*)\}_\{([^}]*)\}_\{([^}]*)\}\$$/);
      return match ? <QuestionImage key={key} url={match[1]} align={match[2]} width={match[3]} display={match[4]} /> : token;
    }
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={key}>{renderTokens(token.slice(2, -2), `${key}-bold`)}</strong>;
    if (token.startsWith("__") && token.endsWith("__")) return <u key={key}>{renderTokens(token.slice(2, -2), `${key}-underline`)}</u>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={key}>{renderTokens(token.slice(1, -1), `${key}-italic`)}</em>;
    if (token.startsWith("$") && token.endsWith("$")) return <MathToken key={key} value={token} displayStyle={mathDisplayStyle} />;
    return <span key={key}>{token}</span>;
  });

  const lines = splitPassageLines(preparedContent);
  const tableRow = (line) => line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
  const parseTableMetadata = (value) => {
    if (!value.startsWith(LATEX_TABLE_META_START)) return { content: value, metadata: null };
    const end = value.indexOf(LATEX_TABLE_META_END, LATEX_TABLE_META_START.length);
    if (end < 0) return { content: value, metadata: null };
    try {
      return {
        content: value.slice(end + LATEX_TABLE_META_END.length),
        metadata: JSON.parse(decodeURIComponent(value.slice(LATEX_TABLE_META_START.length, end))),
      };
    } catch {
      return { content: value, metadata: null };
    }
  };
  const parseTableCell = (value) => {
    let content = value;
    let colSpan = 1;
    let rowSpan = 1;
    let textAlign;
    if (content.startsWith(LATEX_TABLE_ALIGN_START)) {
      const end = content.indexOf(LATEX_TABLE_ALIGN_END, LATEX_TABLE_ALIGN_START.length);
      if (end >= 0) {
        textAlign = content.slice(LATEX_TABLE_ALIGN_START.length, end);
        content = content.slice(end + LATEX_TABLE_ALIGN_END.length);
      }
    }
    if (content.startsWith(LATEX_TABLE_ROWSPAN_START)) {
      const end = content.indexOf(LATEX_TABLE_ROWSPAN_END, LATEX_TABLE_ROWSPAN_START.length);
      if (end >= 0) {
        rowSpan = Math.max(1, Number(content.slice(LATEX_TABLE_ROWSPAN_START.length, end)) || 1);
        content = content.slice(end + LATEX_TABLE_ROWSPAN_END.length);
      }
    }
    if (content.startsWith(LATEX_TABLE_COLSPAN_START)) {
      const end = content.indexOf(LATEX_TABLE_COLSPAN_END, LATEX_TABLE_COLSPAN_START.length);
      if (end >= 0) {
        colSpan = Math.max(1, Number(content.slice(LATEX_TABLE_COLSPAN_START.length, end)) || 1);
        content = content.slice(end + LATEX_TABLE_COLSPAN_END.length);
      }
    }
    return { content, colSpan, rowSpan, textAlign };
  };
  const tableStart = lines.findIndex((line, index) => {
    if (!line.trim().startsWith("|") || !line.trim().endsWith("|") || index + 1 >= lines.length) return false;
    const separator = tableRow(lines[index + 1]);
    return separator.length > 0 && separator.every((cell) => /^:?-{3,}:?$/.test(cell));
  });
  let table = null;
  if (tableStart !== -1) {
    let tableEnd = tableStart + 2;
    while (tableEnd < lines.length && lines[tableEnd].trim().startsWith("|") && lines[tableEnd].trim().endsWith("|")) tableEnd += 1;
    const header = tableRow(lines[tableStart]);
    const parsedMetadata = parseTableMetadata(header[0] || "");
    header[0] = parsedMetadata.content;
    const widthMatch = header[0]?.match(/\{tw=([^}]+)\}/);
    header[0] = header[0]?.replace(/\s*\{tw=[^}]+\}\s*$/, "") || "";
    table = {
      before: `${lines.slice(0, tableStart).join("\n")}\n`,
      after: lines.slice(tableEnd).join("\n"),
      header,
      rows: lines.slice(tableStart + 2, tableEnd).map(tableRow),
      width: widthMatch && /^\d+(?:\.\d+)?%$/.test(widthMatch[1]) ? widthMatch[1] : "100%",
      metadata: parsedMetadata.metadata,
    };
  }

  const tableColumnCount = table
    ? Number(table.metadata?.columnCount) || Math.max(1, ...[table.header, ...table.rows].map(row => row.reduce((count, cell) => count + (parseTableCell(cell).colSpan || 1), 0)))
    : 1;
  const layoutTableRows = (rows) => {
    const activeRowSpans = Array.from({ length: tableColumnCount }, () => 0);
    return rows.map(row => {
      const sourceCells = row.map(parseTableCell);
      const placed = [];
      let sourceIndex = 0;
      let logicalColumn = 0;
      while (logicalColumn < tableColumnCount) {
        if (activeRowSpans[logicalColumn] > 0) {
          const placeholder = sourceCells[sourceIndex];
          if (placeholder && placeholder.colSpan === 1 && placeholder.rowSpan === 1 && !placeholder.content.trim()) sourceIndex += 1;
          activeRowSpans[logicalColumn] = Math.max(0, activeRowSpans[logicalColumn] - 1);
          logicalColumn += 1;
          continue;
        }
        const cell = sourceCells[sourceIndex++] ?? { content: "", colSpan: 1, rowSpan: 1, textAlign: undefined };
        const colSpan = Math.max(1, Math.min(tableColumnCount - logicalColumn, cell.colSpan || 1));
        placed.push({ cell: { ...cell, colSpan }, start: logicalColumn });
        if (cell.rowSpan > 1) {
          for (let column = logicalColumn; column < logicalColumn + colSpan; column += 1) activeRowSpans[column] = Math.max(activeRowSpans[column], cell.rowSpan - 1);
        }
        logicalColumn += colSpan;
      }
      return placed;
    });
  };
  const laidOutTableRows = table ? layoutTableRows([table.header, ...table.rows]) : [];
  const tableRuleCovers = (rules, start, end) => Array.isArray(rules) && rules.some(rule => Number(rule?.start) <= start && Number(rule?.end) >= end);
  const tableCellStyle = (rowIndex, start, end, parsedCell) => {
    const metadata = table?.metadata;
    const alignment = parsedCell.textAlign || metadata?.alignments?.[start] || undefined;
    if (!metadata) return alignment ? { textAlign: alignment } : undefined;
    const rulesAfter = Array.isArray(metadata.rulesAfter) ? metadata.rulesAfter : [];
    const topRules = rowIndex === 0 ? metadata.topRules : rulesAfter[rowIndex - 1];
    const bottomRules = rulesAfter[rowIndex + Math.max(1, parsedCell.rowSpan || 1) - 1];
    const vertical = Array.isArray(metadata.verticalBoundaries) ? metadata.verticalBoundaries : [];
    return {
      ...(alignment ? { textAlign: alignment } : {}),
      borderTop: tableRuleCovers(topRules, start, end) ? "2px solid #000" : "0",
      borderRight: vertical[end] ? "2px solid #000" : "0",
      borderBottom: tableRuleCovers(bottomRules, start, end) ? "2px solid #000" : "0",
      borderLeft: vertical[start] ? "2px solid #000" : "0",
    };
  };
  const renderTableCells = (row, rowIndex, header = false) => row.map(({ cell: parsedCell, start }, cellIndex) => {
      const end = start + parsedCell.colSpan;
      const cellProps = {
        key: cellIndex,
        colSpan: parsedCell.colSpan,
        ...(parsedCell.rowSpan > 1 ? { rowSpan: parsedCell.rowSpan } : {}),
        style: tableCellStyle(rowIndex, start, end, parsedCell),
      };
      return header
        ? <th {...cellProps}>{renderTokens(parsedCell.content, `table-head-${cellIndex}`)}</th>
        : <td {...cellProps}>{renderTokens(parsedCell.content, `table-${rowIndex - 1}-${cellIndex}`)}</td>;
    });
  const ContentRoot = inline ? "span" : "div";
  return (
    <ContentRoot className={`rich-question-content${inline ? " rich-question-content-inline" : ""}`}>
      {table ? <>
        {renderTokens(table.before, "before-table")}
        <div className="math-table-container"><table style={table.metadata ? { width: table.width, border: 0, borderCollapse: "collapse" } : { width: table.width }}><thead><tr>{renderTableCells(laidOutTableRows[0] ?? [], 0, true)}</tr></thead><tbody>{laidOutTableRows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{renderTableCells(row, rowIndex + 1)}</tr>)}</tbody></table></div>
        {renderTokens(table.after, "after-table")}
      </> : wrapParagraphs ? lines.map((paragraph, index, paragraphs) => <React.Fragment key={index}><span className="rich-paragraph">{renderTokens(paragraph, `paragraph-${index}`)}</span>{index < paragraphs.length - 1 && !paragraph.endsWith("}_{block}$") && !/\$\/image-row_[^\n]*\}\$$/.test(paragraph.trim()) && <br />}</React.Fragment>) : renderTokens(preparedContent, "content")}
    </ContentRoot>
  );
}

function resolveGroupHeading(value, start, end) {
  return value.replace(/\{start\}/gi, String(start)).replace(/\{end\}/gi, String(end));
}

function GroupPassageContent({ content, start = 1, end = start }) {
  const passageLines = splitPassageLines(protectRichCitationLineBreaks(content)).map(restoreRichCitationLineBreaks);
  const [heading, passageTitle, ...bodyLines] = passageLines;
  const paragraphs = bodyLines.map((line) => line.trim()).filter(Boolean);
  return <div className="group-passage-content"><h2 className="group-passage-title"><RichQuestionContent content={resolveGroupHeading(heading, start, end)} mathDisplayStyle /></h2>{passageTitle && <h2 className="group-passage-heading"><RichQuestionContent content={resolveGroupHeading(passageTitle, start, end)} mathDisplayStyle /></h2>}<div className="group-passage-body"><RichQuestionContent content={paragraphs.join("\n")} mathDisplayStyle wrapParagraphs /></div></div>;
}

export function GroupPassage({ content, start = 1, end = start, className = "" }) {
  const passageRef = useRef(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const passage = passageRef.current;
    if (!passage) return undefined;
    const update = () => setScrollable(passage.scrollHeight > passage.clientHeight + 1);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(passage);
    if (passage.firstElementChild) observer.observe(passage.firstElementChild);
    return () => observer.disconnect();
  }, [content]);

  return <div ref={passageRef} className={`group-passage ${scrollable ? "is-scrollable" : "not-scrollable"}${className ? ` ${className}` : ""}`}><GroupPassageContent content={content} start={start} end={end} /></div>;
}

function blankCount(question) {
  return Math.max(1, (question.content.match(/____/g) || []).length);
}

function dragAnswerIndexes(question, value) {
  const items = question.data_questions?.items || [];
  const raw = Array.isArray(value) ? value : [];
  const claimedLegacyIndexes = new Set();
  return Array.from({ length: blankCount(question) }, (_, slotIndex) => {
    const answer = raw[slotIndex];
    if (Number.isInteger(answer)) return answer;
    if (answer === undefined || answer === null || answer === "" || answer === -1) return -1;
    const legacyIndex = items.findIndex((item, itemIndex) => !claimedLegacyIndexes.has(itemIndex) && String(item) === String(answer));
    if (legacyIndex !== -1) claimedLegacyIndexes.add(legacyIndex);
    return legacyIndex;
  });
}

export function isAnswered(question, value) {
  if (question?._loading) return false;
  if (value === undefined || value === null) return false;
  if (question.type === "single_choice") return Number.isInteger(value);
  if (question.type === "multiple_choice") return Array.isArray(value) && value.length > 0;
  if (question.type === "fill_in_blank") return Array.isArray(value) && value.length >= blankCount(question) && value.slice(0, blankCount(question)).every((item) => String(item ?? "").trim() !== "");
  if (question.type === "drag_and_drop") {
    if (!Array.isArray(value) || value.length < blankCount(question)) return false;
    const indexes = dragAnswerIndexes(question, value);
    return indexes.every((index) => Number.isInteger(index) && index >= 0 && index < question.data_questions.items.length)
      && new Set(indexes).size === indexes.length;
  }
  if (question.type === "true_false") {
    const items = question.data_questions?.items || [];
    return Array.isArray(value) && items.length > 0 && value.length >= items.length
      && value.slice(0, items.length).every((item) => typeof item === "boolean");
  }
  if (question.type === "ordering") {
    const items = question.data_questions?.items || [];
    if (!Array.isArray(value) || value.length !== items.length || items.length === 0) return false;
    const itemValues = items.map((item, index) => String(item?.value ?? index));
    const normalized = value.map((item) => String(item));
    return normalized.every((item) => itemValues.includes(item)) && new Set(normalized).size === items.length;
  }
  if (question.type === "matching") {
    const leftItems = question.data_questions.left_items;
    const rightItems = question.data_questions.right_items;
    if (!Array.isArray(value) || value.length !== leftItems.length) return false;
    const indexes = value.map((item) => {
      const normalized = String(item ?? "");
      return /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
    });
    return indexes.every((index) => Number.isInteger(index) && index >= 0 && index < rightItems.length)
      && new Set(indexes).size === leftItems.length;
  }
  return false;
}

export function QuestionAnswer({ question, value, onChange, mathDisplayStyle = false, readOnly = false, hideEmptyReadOnlyBlanks = false }) {
  const answers = question.data_questions?.answers || [];
  const items = question.data_questions?.items || [];
  const blanks = blankCount(question);
  const [matchingOpen, setMatchingOpen] = useState(null);
  const [touchDragIndex, setTouchDragIndex] = useState(null);
  const matchingRootRef = useRef(null);
  const matchingButtonRefs = useRef([]);
  const dragValues = question.type === "drag_and_drop" ? dragAnswerIndexes(question, value) : null;
  const usedDragIndexes = new Set((dragValues || []).filter((itemIndex) => itemIndex !== -1));

  useEffect(() => {
    if (readOnly || matchingOpen === null) return undefined;
    const closeMatching = (restoreFocus = false) => {
      const trigger = matchingButtonRefs.current[matchingOpen];
      setMatchingOpen(null);
      if (restoreFocus) queueMicrotask(() => trigger?.focus());
    };
    const handlePointerDown = (event) => {
      if (!matchingRootRef.current?.contains(event.target)) closeMatching(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMatching(true);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [matchingOpen, readOnly]);

  const updateArrayValue = (index, nextValue) => {
    if (readOnly) return;
    const next = Array.isArray(value) ? [...value] : Array(blanks).fill("");
    next[index] = nextValue;
    onChange(next);
  };

  const selectDragItem = (itemIndex) => {
    if (readOnly) return;
    setTouchDragIndex((current) => current === itemIndex ? null : itemIndex);
  };

  const placeSelectedDragItem = (slotIndex) => {
    if (readOnly || touchDragIndex === null) return;
    const next = [...dragValues];
    next[slotIndex] = touchDragIndex;
    onChange(next);
    setTouchDragIndex(null);
  };

  const renderBlank = (index) => {
    if (question.type === "fill_in_blank") {
      const inputValue = value?.[index] || "";
      if (readOnly && String(inputValue).trim()) {
        const formattedValue = formatLatexAnswerForDisplay(String(inputValue));
        return <span className="math-blank-answer answer-green-box"><RichQuestionContent content={typeof formattedValue === "string" ? formattedValue : formattedValue.join(", ")} inline /></span>;
      }
      if (readOnly && hideEmptyReadOnlyBlanks) return null;
      return <input aria-label={`Ô trả lời ${index + 1}`} className="math-blank-input" value={inputValue} readOnly={readOnly} tabIndex={readOnly ? -1 : undefined} style={{ width: `${Math.max(4, String(inputValue).trim().length + 1)}ch`, minWidth: "80px", maxWidth: "100%" }} onChange={(event) => updateArrayValue(index, event.target.value)} />;
    }
    if (question.type === "drag_and_drop") {
      const selectedIndex = dragValues[index] ?? -1;
      const selected = selectedIndex >= 0 && selectedIndex < items.length;
      return <div className={`drag-blank ${selected ? "filled" : ""}${readOnly && selected ? " answer-green-box" : ""}`} data-drop-zone={index} role={readOnly ? undefined : "button"} tabIndex={readOnly ? undefined : 0} aria-label={`Vị trí thả ${index + 1}${selected ? ", đã có đáp án" : ""}`} aria-disabled={readOnly || undefined} onClick={readOnly ? undefined : () => placeSelectedDragItem(index)} onKeyDown={readOnly ? undefined : (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); placeSelectedDragItem(index); } }} onDragOver={readOnly ? undefined : (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={readOnly ? undefined : (event) => {
        event.preventDefault();
        const itemIndex = Number.parseInt(event.dataTransfer.getData("text/plain"), 10);
        if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= items.length) return;
        const next = [...dragValues];
        next[index] = itemIndex;
        onChange(next);
      }}>{selected ? <span title={readOnly ? undefined : "Click để xóa và trả về danh sách"} onClick={readOnly ? undefined : (event) => { event.stopPropagation(); const next = [...dragValues]; next[index] = -1; onChange(next); }}><MathOrText value={items[selectedIndex]} /></span> : null}</div>;
    }
    return null;
  };

  if (question.type === "true_false") {
    const hasTrailingLine = /\r?\n$/.test(question.content || "");
    return (
      <div className={`question-answer true-false-answer ${hasTrailingLine ? "has-trailing-line" : ""}`}><RichQuestionContent content={question.content} mathDisplayStyle={mathDisplayStyle} />
        <div className="true-false-list" role="table" aria-label="Các khẳng định đúng sai">
          <div className="true-false-head" role="row"><span /><span>Đúng</span><span>Sai</span></div>
          {items.map((item, index) => (
            <div className="true-false-row" role="row" key={index}>
              <RichQuestionContent content={item.content} mathDisplayStyle={mathDisplayStyle} />
              <div className="true-false-cell"><button type="button" disabled={readOnly} aria-label="Đúng" data-statement={index + 1} aria-pressed={value?.[index] === true} className={value?.[index] === true ? "selected true" : ""} onClick={() => { const next = Array.isArray(value) ? [...value] : Array(items.length); next[index] = true; onChange(next); }} /></div>
              <div className="true-false-cell"><button type="button" disabled={readOnly} aria-label="Sai" data-statement={index + 1} aria-pressed={value?.[index] === false} className={value?.[index] === false ? "selected false" : ""} onClick={() => { const next = Array.isArray(value) ? [...value] : Array(items.length); next[index] = false; onChange(next); }} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === "single_choice" || question.type === "multiple_choice") {
    const multiple = question.type === "multiple_choice";
    return (
      <><RichQuestionContent content={question.content} /><div className={`math-choice-list ${multiple ? "multiple" : "single"} columns-${Math.min(question.option_columns || 1, 4)}`}>
        {answers.map((answer, index) => {
          const selected = multiple ? Array.isArray(value) && value.includes(index) : value === index;
          const selectAnswer = () => {
            if (readOnly) return;
            if (multiple) onChange(selected ? value.filter((item) => item !== index) : [...(value || []), index]);
            else onChange(index);
          };
          return <div role={readOnly ? undefined : "button"} tabIndex={readOnly ? undefined : 0} key={index} aria-pressed={readOnly ? undefined : selected} aria-disabled={readOnly || undefined} className={`math-choice-option ${selected ? "selected" : ""}`} onClick={readOnly ? undefined : selectAnswer} onKeyDown={readOnly ? undefined : (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectAnswer(); } }}><i /><MathOrText value={answer.content} /></div>;
        })}
      </div></>
    );
  }

  if (question.type === "ordering") {
    const orderingItems = question.data_questions?.items || [];
    const orderingValue = Array.isArray(value) ? value.map((item) => String(item)) : [];
    const itemValue = (item, index) => String(item?.value ?? index);
    const itemContent = (item) => item?.content ?? item?.label ?? item;
    const isSelected = (item, index) => orderingValue.includes(itemValue(item, index));
    const selectItem = (item, index) => {
      if (readOnly) return;
      const selectedValue = itemValue(item, index);
      if (!orderingValue.includes(selectedValue)) onChange([...orderingValue, selectedValue]);
    };
    const removeItem = (selectedIndex) => {
      if (!readOnly) onChange(orderingValue.filter((_, index) => index !== selectedIndex));
    };
    const moveItem = (selectedIndex, direction) => {
      if (readOnly) return;
      const targetIndex = selectedIndex + direction;
      if (targetIndex < 0 || targetIndex >= orderingValue.length) return;
      const next = [...orderingValue];
      [next[selectedIndex], next[targetIndex]] = [next[targetIndex], next[selectedIndex]];
      onChange(next);
    };
    return <div className="ordering-question">
      <p className="ordering-instruction">Chọn các phương án theo thứ tự đúng:</p>
      <div className="ordering-bank" aria-label="Phương án chưa xếp">{orderingItems.map((item, index) => !isSelected(item, index) && <button type="button" disabled={readOnly} key={itemValue(item, index)} onClick={() => selectItem(item, index)}><MathOrText value={itemContent(item)} /></button>)}</div>
      <div className="ordering-list" role="list" aria-label="Thứ tự đã chọn">{orderingValue.map((selectedValue, selectedIndex) => {
        const itemIndex = orderingItems.findIndex((item, index) => itemValue(item, index) === selectedValue);
        const item = orderingItems[itemIndex];
        return <div className="ordering-row" role="listitem" key={`${selectedValue}-${selectedIndex}`}><b>{selectedIndex + 1}</b><span><MathOrText value={item ? itemContent(item) : selectedValue} /></span><button type="button" disabled={readOnly || selectedIndex === 0} aria-label="Đưa lên" onClick={() => moveItem(selectedIndex, -1)}>↑</button><button type="button" disabled={readOnly || selectedIndex === orderingValue.length - 1} aria-label="Đưa xuống" onClick={() => moveItem(selectedIndex, 1)}>↓</button><button type="button" disabled={readOnly} aria-label="Bỏ phương án" onClick={() => removeItem(selectedIndex)}>×</button></div>;
      })}</div>
    </div>;
  }

  if (question.type === "matching") {
    const leftItems = question.data_questions?.left_items || [];
    const rightItems = question.data_questions?.right_items || [];
    const chooseMatchingAnswer = (rightIndex) => {
      if (readOnly) return;
      const next = Array.isArray(value) ? [...value] : Array(leftItems.length).fill(null);
      next.forEach((chosen, chosenIndex) => {
        if (chosenIndex !== matchingOpen && Number(chosen) === rightIndex) next[chosenIndex] = null;
      });
      next[matchingOpen] = rightIndex;
      onChange(next);
      const trigger = matchingButtonRefs.current[matchingOpen];
      setMatchingOpen(null);
      queueMicrotask(() => trigger?.focus());
    };
    return <div ref={matchingRootRef} className="matching-question">
      <RichQuestionContent content={question.content} />
      <div className="matching-list">{leftItems.map((item, index) => {
        const selectedIndex = value?.[index];
        const normalizedIndex = selectedIndex === null || selectedIndex === undefined || selectedIndex === "" ? -1 : Number(selectedIndex);
        const selected = Number.isInteger(normalizedIndex) && normalizedIndex >= 0 && normalizedIndex < rightItems.length;
        return <div className="matching-row" key={index}>
          <div className="matching-prompt"><i aria-hidden="true">{index + 1}</i><span className="matching-text"><MathOrText value={item.content} /></span></div>
          <span className="matching-arrow" aria-hidden="true"><MatchingArrowIcon /></span>
          <button ref={(node) => { matchingButtonRefs.current[index] = node; }} type="button" disabled={readOnly} className={`matching-choice ${selected ? "selected" : ""} ${selected && readOnly ? "answer-selected" : ""}`} aria-label={`Ghép ý ${index + 1}${selected ? `, đáp án ${alphabeticLabel(normalizedIndex, true)}` : ""}`} aria-haspopup={readOnly ? undefined : "dialog"} aria-expanded={readOnly ? undefined : matchingOpen === index} onClick={() => setMatchingOpen(index)}>
            {selected ? <i className="matching-badge" aria-hidden="true">{alphabeticLabel(normalizedIndex, true)}</i> : <i className="matching-empty-badge" aria-hidden="true" />}
            <span className="matching-text">{selected ? <MathOrText value={rightItems[normalizedIndex]?.content} /> : "Bấm chọn đáp án"}</span>
          </button>
        </div>;
      })}</div>
      <div className="matching-bank">
        <div className="matching-bank-title">Danh sách</div>
        <div className="matching-bank-grid">{rightItems.map((right, rightIndex) => <div className="matching-bank-item" key={rightIndex}><i className="matching-badge" aria-hidden="true">{alphabeticLabel(rightIndex, true)}</i><span className="matching-text"><MathOrText value={right.content} /></span></div>)}</div>
      </div>
      {!readOnly && matchingOpen !== null && <div className="matching-modal" role="dialog" aria-modal="true" aria-label={`Chọn đáp án cho ý ${matchingOpen + 1}`}>
        <div className="matching-modal-mask" onClick={() => setMatchingOpen(null)} />
        <div className="matching-modal-panel">
          <div className="matching-modal-header"><span>Chọn đáp án cho <i className="matching-modal-badge">{matchingOpen + 1}</i></span><button type="button" aria-label="Đóng danh sách ghép ý" onClick={() => setMatchingOpen(null)}>×</button></div>
          <div className="matching-modal-options" role="listbox" aria-label={`Danh sách ghép ý ${matchingOpen + 1}`}>{rightItems.map((right, rightIndex) => {
            const selected = Number(value?.[matchingOpen]) === rightIndex;
            return <button type="button" role="option" aria-selected={selected} className={selected ? "selected" : ""} key={rightIndex} onClick={() => chooseMatchingAnswer(rightIndex)}><i className="matching-modal-badge" aria-hidden="true">{alphabeticLabel(rightIndex, true)}</i><span><MathOrText value={right.content} /></span></button>;
          })}</div>
        </div>
      </div>}
    </div>;
  }

  return (
    <>
      {question.type === "drag_and_drop" && (
        <><div className="drag-bank">
          {items.map((item, itemIndex) => ({ item, itemIndex })).filter(({ itemIndex }) => !usedDragIndexes.has(itemIndex)).map(({ item, itemIndex }) => <div key={itemIndex} className={touchDragIndex === itemIndex ? "touch-selected" : ""} draggable={!readOnly} role={readOnly ? undefined : "button"} tabIndex={readOnly ? undefined : 0} aria-pressed={readOnly ? undefined : touchDragIndex === itemIndex} aria-disabled={readOnly || undefined} title={readOnly ? undefined : "Kéo bằng chuột hoặc chạm để chọn"} onClick={readOnly ? undefined : () => selectDragItem(itemIndex)} onKeyDown={readOnly ? undefined : (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectDragItem(itemIndex); } }} onDragStart={readOnly ? undefined : (event) => { event.dataTransfer.setData("text/plain", String(itemIndex)); event.dataTransfer.effectAllowed = "move"; }}><MathOrText value={item} /></div>)}
        </div><p className="drag-instruction">Kéo các ô vuông thả vào vị trí thích hợp trong các câu sau:</p></>
      )}
      <RichQuestionContent content={question.content} renderBlank={renderBlank} />
    </>
  );
}

function MathOrText({ value }) {
  if (typeof value === "string") {
    const formattedValue = formatLatexAnswerForDisplay(value);
    return <RichQuestionContent content={typeof formattedValue === "string" ? formattedValue : formattedValue.join(", ")} />;
  }
  return <span>{value}</span>;
}

function reviewAnswerItemContent(item) {
  let raw = "";
  if (item && typeof item === "object") raw = String(item.content ?? item.label ?? item.value ?? "");
  else raw = String(item ?? "");
  const formatted = formatLatexAnswerForDisplay(raw);
  return typeof formatted === "string" ? formatted : formatted.join(", ");
}

function reviewAnswerSummaryItems(question, value) {
  const answers = question.data_questions?.answers || [];
  const items = question.data_questions?.items || [];
  if (question.type === "single_choice") {
    const index = Number(value);
    return Number.isInteger(index) && answers[index] ? [`${String.fromCharCode(65 + index)}. ${reviewAnswerItemContent(answers[index])}`] : [];
  }
  if (question.type === "multiple_choice") {
    return (Array.isArray(value) ? value : []).map(Number).filter((index) => Number.isInteger(index) && answers[index]).map((index) => `${String.fromCharCode(65 + index)}. ${reviewAnswerItemContent(answers[index])}`);
  }
  if (question.type === "true_false") {
    return items.flatMap((_, index) => Array.isArray(value) && typeof value[index] === "boolean" ? [`Ý ${index + 1}: ${value[index] ? "Đúng" : "Sai"}`] : []);
  }
  if (question.type === "fill_in_blank") {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return values.map((item, index) => `Ô ${index + 1}: ${String(item).trim()}`).filter((item) => !item.endsWith(": "));
  }
  if (question.type === "drag_and_drop") {
    return (Array.isArray(value) ? value : []).flatMap((item, index) => {
      const itemIndex = Number(item);
      return Number.isInteger(itemIndex) && itemIndex >= 0 && items[itemIndex] ? [`Ô ${index + 1}: ${reviewAnswerItemContent(items[itemIndex])}`] : [];
    });
  }
  if (question.type === "ordering") {
    return (Array.isArray(value) ? value : []).map((item) => {
      const selected = items.find((candidate) => String(typeof candidate === "object" ? candidate.value : candidate) === String(item));
      return reviewAnswerItemContent(selected ?? item);
    });
  }
  if (question.type === "matching") {
    const rightItems = question.data_questions?.right_items || [];
    return (question.data_questions?.left_items || []).flatMap((_, index) => {
      const selectedIndex = Number(Array.isArray(value) ? value[index] : -1);
      return Number.isInteger(selectedIndex) && selectedIndex >= 0 && rightItems[selectedIndex] ? [`Ý ${index + 1}: ${reviewAnswerItemContent(rightItems[selectedIndex])}`] : [];
    });
  }
  return value === undefined || value === null || value === "" ? [] : [String(value)];
}

function MathReviewDetails({ question, correctAnswer, solution }) {
  const answerItems = reviewAnswerSummaryItems(question, correctAnswer);
  const solutionText = String(solution || "").trim();
  if (!answerItems.length && !solutionText) return null;
  return <section className="math-review-details" aria-label="Đáp án và lời giải">
    {answerItems.length > 0 && <div className="math-review-correct-answer"><strong>Đáp án đúng</strong><div>{answerItems.map((item, index) => <span key={`${question.id}-correct-${index}`}><RichQuestionContent content={item} /></span>)}</div></div>}
    {solutionText && <details><summary>Lời giải</summary><div className="math-review-solution-content"><RichQuestionContent content={solutionText} /></div></details>}
  </section>;
}

function SubmitMathModal({ answered, total, timedOut = false, submitting = false, error = "", onContinue, onSubmit }) {
  const dialogRef = useRef(null);
  const onContinueRef = useRef(onContinue);

  useEffect(() => {
    onContinueRef.current = onContinue;
  }, [onContinue]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const focusable = () => [...(dialogRef.current?.querySelectorAll("button:not(:disabled)") || [])];
    dialogRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !timedOut) {
        event.preventDefault();
        onContinueRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [timedOut]);

  return (
    <div className="math-submit-backdrop" onMouseDown={(event) => { if (!timedOut && !submitting && event.target === event.currentTarget) onContinue?.(); }}>
      <section ref={dialogRef} className="math-submit-modal" role="dialog" aria-modal="true" aria-labelledby="math-submit-title" tabIndex={-1}>
        {!timedOut && <button className="math-submit-close" aria-label="Đóng hộp thoại" onClick={onContinue} disabled={submitting}><ExamIcon name="close" size={16} /></button>}
        <div className="submit-count"><strong>{answered}/{total}</strong><span>câu</span></div>
        <p id="math-submit-title">{timedOut ? `Thời gian làm bài đã kết thúc. Hệ thống sẽ nộp ${answered}/${total} câu bạn đã trả lời.` : `Đã trả lời ${answered}/${total} câu. Bạn vẫn còn thời gian làm bài, bạn có chắc chắn muốn kết thúc bài thi.`}</p>
        {error && <div className="math-submit-error" role="alert">{error}</div>}
        <div>{!timedOut && <button onClick={onContinue} disabled={submitting}>Làm bài tiếp</button>}<button className={timedOut ? "only-action" : ""} onClick={onSubmit} disabled={submitting} aria-busy={submitting}>{submitting ? "Đang nộp…" : "Nộp bài thi"}</button></div>
      </section>
    </div>
  );
}

export function MathConfirmation({ onBack, onStart }) {
  return (
    <main className="math-confirm-page">
      <section className="math-confirm-card">
        <div className="math-confirm-logo-block"><div className="math-confirm-logo"><span className="tsa-math-remix-logo" aria-label="MATH REMIX">MATH <b>REMIX</b></span></div></div>
        <h1>Xác nhận thông tin dự thi</h1>
        <div className="math-confirm-info"><p><span>Họ tên</span><strong>Huỳnh Huy</strong></p><p><span>Kíp thi</span><strong>Đề Số 01</strong></p><p><span>Cấu trúc</span><strong>3 phần · 100 câu</strong></p></div>
        <p className="math-confirm-note">Lưu ý: Bằng việc nhấn nút “Bắt đầu thi” hệ thống sẽ bắt đầu tính giờ cho bài thi của bạn</p>
        <button className="math-confirm-start" onClick={onStart}>Bắt đầu thi</button>
        <div className="math-confirm-links"><button onClick={onBack}>Quay lại</button><button>Hướng dẫn</button></div>
      </section>
    </main>
  );
}

export function buildPartData(partId) {
  return { title: EXAM_PART_LABELS[partId] || EXAM_PART_LABELS.math, time: 60, questions: [] };
}

export default function MathExam({ onSubmit, onProgress, onQuestionRequest, part, partData: suppliedPartData = null, initialState = null, initialSubmit = false, freezeTimer = false, readOnly = false, allowBookmarkInReadOnly = false, examTitle = "", candidateName = "Thí sinh", candidateId = "", logoSrc = "/logo_tsa.svg", headerExtras = null, navigationPolicy = {}, answerPreview = false, reviewStatuses = [], correctAnswers = {}, solutions = [] }) {
  const partData = useMemo(() => suppliedPartData || buildPartData(part?.id), [part?.id, suppliedPartData]);
  const examPartLabel = part?.label || EXAM_PART_LABELS[part?.id] || EXAM_PART_LABELS.math;
  const questions = partData.questions;
  const initialAnswerSignature = JSON.stringify(initialState?.answers || {});
  const synchronizedAnswers = useMemo(() => JSON.parse(initialAnswerSignature), [initialAnswerSignature]);
  const [currentIndex, setCurrentIndex] = useState(initialState?.currentIndex || 0);
  const [answerChanges, setAnswerChanges] = useState({});
  const answers = useMemo(() => ({ ...synchronizedAnswers, ...answerChanges }), [answerChanges, synchronizedAnswers]);
  const setAnswers = (update) => setAnswerChanges(previous => {
    const currentAnswers = { ...synchronizedAnswers, ...previous };
    return typeof update === "function" ? update(currentAnswers) : update;
  });
  const [marked, setMarked] = useState(initialState?.marked || []);
  const [visited, setVisited] = useState(initialState?.visited || []);
  const [remaining, setRemaining] = useState(initialState?.remainingSeconds ?? partData.time * 60);
  const [questionSeconds, setQuestionSeconds] = useState(initialState?.questionSeconds || 0);
  const [showSubmit, setShowSubmit] = useState(initialSubmit ? "manual" : null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(Boolean(initialState?.mobileMenu));
  const [showOrientationNotice, setShowOrientationNotice] = useState(true);
  const questionCardRef = useRef(null);
  const sidebarRef = useRef(null);
  const sideCloseRef = useRef(null);
  const menuReturnFocusRef = useRef(null);
  const previousQuestionIndexRef = useRef(currentIndex);
  const autoScrollQuestionIndexRef = useRef(currentIndex);
  const initialRemainingSeconds = Math.max(0, initialState?.remainingSeconds ?? partData.time * 60);
  const timerInitialRemainingRef = useRef(initialRemainingSeconds);
  const questionStartedAtRef = useRef(null);
  const currentQuestion = questions[currentIndex];
  const currentReviewStatus = answerPreview ? reviewStatuses[currentIndex] || "unanswered" : "";
  const bookmarkDisabled = readOnly && !allowBookmarkInReadOnly;
  const groupedQuestions = currentQuestion?._groupId ? questions.filter((question) => question._groupId === currentQuestion._groupId) : null;
  const isGroupedPart = Boolean(groupedQuestions);
  const groupStartIndex = groupedQuestions ? questions.findIndex((question) => question.id === groupedQuestions[0].id) : currentIndex;
  const groupEndIndex = groupedQuestions ? questions.findIndex((question) => question.id === groupedQuestions[groupedQuestions.length - 1].id) : currentIndex;
  const previousIndex = groupedQuestions ? groupStartIndex - 1 : currentIndex - 1;
  const nextIndex = groupedQuestions ? groupEndIndex + 1 : currentIndex + 1;
  const allowSkip = navigationPolicy.allowSkip !== false;
  const allowBacktrack = navigationPolicy.allowBacktrack !== false;
  const canNavigateTo = useCallback((index) => {
    if (index < 0 || index >= questions.length || index === currentIndex) return false;
    if (index < currentIndex && !allowBacktrack) return false;
    if (index > currentIndex && !allowSkip && index !== nextIndex) return false;
    if (index > currentIndex && navigationPolicy.requireAnswerBeforeNext && !isAnswered(currentQuestion, answers[currentQuestion?.id])) return false;
    return true;
  }, [allowBacktrack, allowSkip, answers, currentIndex, currentQuestion, navigationPolicy.requireAnswerBeforeNext, nextIndex, questions.length]);
  const answered = useMemo(() => questions.filter((question) => isAnswered(question, answers[question.id])).length, [answers, questions]);
  useEffect(() => {
    if (!readOnly && currentQuestion?._loading) onQuestionRequest?.(currentIndex);
  }, [currentIndex, currentQuestion?._loading, onQuestionRequest, readOnly]);

  useEffect(() => {
    const startingRemaining = Math.max(0, initialState?.remainingSeconds ?? partData.time * 60);
    timerInitialRemainingRef.current = startingRemaining;
    questionStartedAtRef.current = Date.now() - (initialState?.questionSeconds || 0) * 1000;
    // Synchronize the timer with a restored attempt or a newly selected part.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemaining(startingRemaining);
    if (freezeTimer || startingRemaining === 0) return undefined;

    // Keep a real deadline so the timer cannot appear frozen when interval
    // callbacks are delayed while the tab is backgrounded or the UI rerenders.
    const deadline = Date.now() + startingRemaining * 1000;
    let timer = null;
    const tick = () => {
      const now = Date.now();
      const nextRemaining = Math.max(0, Math.ceil((deadline - now) / 1000));
      setRemaining(nextRemaining);
      setQuestionSeconds(Math.max(0, Math.floor((now - questionStartedAtRef.current) / 1000)));
      if (nextRemaining === 0 && timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    tick();
    timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [freezeTimer, initialState?.questionSeconds, initialState?.remainingSeconds, partData.time]);
  useEffect(() => {
    if (previousQuestionIndexRef.current === currentIndex) return;
    previousQuestionIndexRef.current = currentIndex;
    questionStartedAtRef.current = Date.now();
    setQuestionSeconds(0);
  }, [currentIndex]);
  useEffect(() => {
    if (autoScrollQuestionIndexRef.current === currentIndex) return;
    autoScrollQuestionIndexRef.current = currentIndex;
    if (!currentQuestion?._groupId || !questionCardRef.current) return;
    const group = questions.filter((question) => question._groupId === currentQuestion._groupId);
    const groupedQuestionList = questionCardRef.current.querySelector(".grouped-questions");
    if (group[0]?.id === currentQuestion.id) return;
    const target = groupedQuestionList?.querySelector(`[data-question-index="${currentIndex}"]`);
    if (!groupedQuestionList || !target) return;
    const listRect = groupedQuestionList.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = groupedQuestionList.scrollTop + targetRect.top - listRect.top;
    const targetBottom = targetTop + targetRect.height;
    const visibleTop = groupedQuestionList.scrollTop;
    const visibleBottom = visibleTop + groupedQuestionList.clientHeight;
    if (targetTop < visibleTop) groupedQuestionList.scrollTop = targetTop;
    else if (targetBottom > visibleBottom) groupedQuestionList.scrollTop = targetBottom - groupedQuestionList.clientHeight;
  }, [currentIndex, currentQuestion?._groupId, currentQuestion?.id, questions]);
  useEffect(() => {
    if (!currentQuestion || currentQuestion._loading) return;
    const ids = currentQuestion._groupId
      ? questions.filter((question) => question._groupId === currentQuestion._groupId).map((question) => question.id)
      : [currentQuestion.id];
    // Visiting a question is deliberately recorded after it becomes active.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisited((items) => [...new Set([...items, ...ids])]);
  }, [currentIndex, currentQuestion, questions]);
  useEffect(() => {
    if (!mobileMenu) return undefined;
    sidebarRef.current?.focus();
    const handleKeyDown = (event) => {
      if (document.querySelector(".math-submit-modal,.question-image-preview")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenu(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(sidebarRef.current?.querySelectorAll("button:not(:disabled),a[href]") || [])]
        .filter((element) => element.getClientRects().length > 0 || element === sideCloseRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const returnTarget = menuReturnFocusRef.current;
      menuReturnFocusRef.current = null;
      returnTarget?.focus?.();
    };
  }, [mobileMenu]);
  useEffect(() => {
    if (remaining === 0) {
      // Opening the timeout dialog is a state transition caused by the timer.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowSubmit("timeout");
    }
  }, [remaining]);
  useEffect(() => {
    onProgress?.({ partId: part?.id, answers, marked, visited, currentIndex, remainingSeconds: remaining, elapsedSeconds: partData.time * 60 - remaining });
  }, [answers, marked, visited, currentIndex, remaining, onProgress, part?.id, partData.time]);

  const openMobileMenu = () => {
    menuReturnFocusRef.current = document.activeElement;
    setMobileMenu(true);
  };
  const closeMobileMenu = () => setMobileMenu(false);
  const goTo = useCallback((index) => { if (!canNavigateTo(index)) return; menuReturnFocusRef.current = null; setCurrentIndex(index); setMobileMenu(false); }, [canNavigateTo]);
  const toggleMark = () => { if (!currentQuestion?._loading) setMarked((items) => items.includes(currentQuestion.id) ? items.filter((id) => id !== currentQuestion.id) : [...items, currentQuestion.id]); };
  const submitPart = async () => {
    if (submitting) return;
    const timedOut = showSubmit === "timeout";
    setSubmitError("");
    setSubmitting(true);
    try {
      await onSubmit?.({ partId: part?.id, answers, marked, visited, currentIndex, remainingSeconds: remaining, answered, total: questions.length, elapsedSeconds: partData.time * 60 - remaining, timedOut, submittedAt: new Date().toISOString() });
      setShowSubmit(null);
    } catch (value) {
      setSubmitError(value instanceof Error ? value.message : "Không thể nộp bài thi.");
    } finally {
      setSubmitting(false);
    }
  };
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.defaultPrevented || document.querySelector(".math-submit-modal,.question-image-preview")) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input,textarea,select,[contenteditable=\"true\"]"))) return;
       const targetIndex = event.key === "ArrowLeft" ? previousIndex : nextIndex;
       if (!canNavigateTo(targetIndex)) return;
      event.preventDefault();
      goTo(targetIndex);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canNavigateTo, goTo, nextIndex, previousIndex]);

  return (
    <div className={`math-exam-page ${isGroupedPart ? "grouped-exam-page" : ""}${answerPreview ? " answer-preview" : ""}`}>
      <main className={`math-question-area ${showOrientationNotice ? "has-orientation-notice" : ""}`}>
        <header className="math-exam-header preview-unified-header"><img src={logoSrc} alt="TSA" /><div className="math-exam-heading"><h1>{examTitle ? `${examTitle} - ${examPartLabel}` : examPartLabel}</h1>{candidateId && <strong>{candidateId}</strong>}</div>{headerExtras}{!isGroupedPart && <button className="math-mobile-menu" aria-expanded={mobileMenu} aria-controls="math-exam-sidebar" onClick={openMobileMenu}><ExamIcon name="menu" /> Menu</button>}</header>
        {showOrientationNotice && <aside className="mobile-orientation-notice" role="status" aria-label="Khuyến nghị xoay ngang thiết bị"><ExamIcon name="rotateRight" size={20} /><p>Xoay ngang để dùng giao diện như laptop và xem đề rõ hơn.</p><button type="button" onClick={() => setShowOrientationNotice(false)}>Đã hiểu</button></aside>}
        <section ref={questionCardRef} className={`math-question-card ${currentQuestion ? `question-${currentQuestion.type}` : "math-question-card-empty"} ${groupedQuestions ? "grouped-question-card" : ""}${currentReviewStatus ? ` review-${currentReviewStatus}` : ""}`}>
          {!currentQuestion ? <div className="math-empty-question-content"><strong>Phần này chưa có câu hỏi</strong><p>Nội dung câu hỏi sẽ hiển thị tại đây sau khi bạn soạn và lưu môi trường <code>ex</code>.</p></div> : currentQuestion._loading ? <div className="math-encrypted-placeholder" aria-busy={!currentQuestion._loadError}>
            <div className="math-question-number">{currentIndex + 1}</div>
            {currentQuestion._loadError
              ? <div className="math-encrypted-error" role="alert"><p>{currentQuestion._loadError}</p><button type="button" onClick={() => onQuestionRequest?.(currentIndex)}>Thử tải lại</button></div>
              : <div className="math-encrypted-skeleton"><i/><i/><i/></div>}
          </div> : groupedQuestions ? <>
            <GroupPassage content={currentQuestion._groupContent} start={groupStartIndex + 1} end={groupEndIndex + 1} />
            <div className="grouped-questions">{groupedQuestions.map((question) => {
              const globalIndex = questions.findIndex((item) => item.id === question.id);
              const reviewStatus = answerPreview ? reviewStatuses[globalIndex] || "unanswered" : "";
              return <article className={`grouped-question ${globalIndex === currentIndex ? "current" : ""}${reviewStatus ? ` review-${reviewStatus}` : ""}`} data-question-index={globalIndex} key={question.id}>
                <div className="math-question-number">{globalIndex + 1}</div>
                <button disabled={bookmarkDisabled} className={`math-bookmark ${marked.includes(question.id) ? "active" : ""}`} data-tooltip={marked.includes(question.id) ? "Bỏ đánh dấu câu hỏi" : "Đánh dấu câu hỏi"} onClick={bookmarkDisabled ? undefined : () => setMarked((items) => items.includes(question.id) ? items.filter((id) => id !== question.id) : [...items, question.id])} aria-label={marked.includes(question.id) ? `Bỏ đánh dấu câu ${globalIndex + 1}` : `Đánh dấu câu ${globalIndex + 1}`}><ExamIcon name="bookmark" /></button>
                <div className="math-question-body"><QuestionAnswer question={question} value={answers[question.id]} onChange={(value) => setAnswers((previous) => ({ ...previous, [question.id]: value }))} mathDisplayStyle readOnly={readOnly} hideEmptyReadOnlyBlanks={answerPreview} />{answerPreview && <MathReviewDetails question={question} correctAnswer={correctAnswers[question.id]} solution={solutions[globalIndex]} />}</div>
              </article>;
            })}</div>
          </> : <>
            <div className="math-question-number">{currentIndex + 1}</div>
            <button disabled={bookmarkDisabled} className={`math-bookmark ${marked.includes(currentQuestion.id) ? "active" : ""}`} data-tooltip={marked.includes(currentQuestion.id) ? "Bỏ đánh dấu câu hỏi" : "Đánh dấu câu hỏi"} onClick={bookmarkDisabled ? undefined : toggleMark} aria-label={marked.includes(currentQuestion.id) ? "Bỏ đánh dấu câu hỏi" : "Đánh dấu câu hỏi"}><ExamIcon name="bookmark" /></button>
            <div className="math-question-body"><QuestionAnswer question={currentQuestion} value={answers[currentQuestion.id]} onChange={(value) => setAnswers((previous) => ({ ...previous, [currentQuestion.id]: value }))} readOnly={readOnly} hideEmptyReadOnlyBlanks={answerPreview} />{answerPreview && <MathReviewDetails question={currentQuestion} correctAnswer={correctAnswers[currentQuestion.id]} solution={solutions[currentIndex]} />}</div>
          </>}
        </section>
        <footer className="math-question-footer">
          <div className="math-nav-buttons"><button disabled={previousIndex < 0} onPointerDown={startExamButtonFeedback} onAnimationEnd={clearExamButtonFeedback} onClick={(event) => playExamButtonFeedback(event, () => goTo(previousIndex))}><ExamIcon name="left" /> Câu trước</button><button disabled={nextIndex >= questions.length} onPointerDown={startExamButtonFeedback} onAnimationEnd={clearExamButtonFeedback} onClick={(event) => playExamButtonFeedback(event, () => goTo(nextIndex))}>Câu tiếp <ExamIcon name="right" /></button></div>
          <div className="question-time"><span>Thời gian làm câu hiện tại</span><strong>{formatQuestionClock(questionSeconds)}</strong></div>
          <strong className="mobile-remaining-time" aria-label="Thời gian còn lại">{formatClock(remaining)}</strong>
          {!isGroupedPart && <button className="math-footer-menu" aria-expanded={mobileMenu} aria-controls="math-exam-sidebar" onClick={readOnly ? undefined : openMobileMenu}><ExamIcon name="menu" size={16} /> Menu</button>}
          {isGroupedPart && <div className="grouped-exam-actions"><span>Thời gian còn lại</span><strong>{formatClock(remaining)}</strong><button disabled={readOnly} aria-expanded={mobileMenu} aria-controls="math-exam-sidebar" onClick={readOnly ? undefined : openMobileMenu}>&lt;&nbsp; Mở Menu / Nộp bài</button></div>}
        </footer>
      </main>

      {mobileMenu && <button className="math-side-overlay" onClick={closeMobileMenu} aria-label="Đóng menu" />}
      <aside ref={sidebarRef} id="math-exam-sidebar" className={`math-exam-sidebar ${isGroupedPart ? "grouped-exam-sidebar" : ""} ${mobileMenu ? "open" : ""}`} tabIndex={-1}>
        <button ref={sideCloseRef} className="math-side-close" onClick={closeMobileMenu} aria-label="Đóng menu"><ExamIcon name="close" /></button>
        <h2>Thông tin thí sinh</h2>
        <div className="math-candidate"><div className="math-candidate-row"><span>Họ tên</span><strong>{candidateName}</strong></div><div className="math-candidate-row"><span>Mã định danh</span><strong>{candidateId || "—"}</strong></div></div>
        <div className="math-time-row"><div><span>Thời gian còn lại</span><strong>{formatClock(remaining)}</strong></div><button disabled={readOnly || submitting} onClick={readOnly || submitting ? undefined : () => { setSubmitError(""); setShowSubmit("manual"); }}>Nộp bài</button></div>
        <div className="math-indicators"><span>Chỉ thị màu sắc:</span><i data-tooltip="Chưa trả lời">{questions.length}</i><i className="answered" data-tooltip="Câu đã trả lời">{answered}</i><i className="marked" data-tooltip="Câu trả lời chưa chắc chắn">{marked.length}</i></div>
        <div className="math-question-grid">{questions.map((question, index) => { const reviewStatus = answerPreview ? reviewStatuses[index] || "unanswered" : ""; return <button key={question.id} aria-label={`Câu ${index + 1}`} className={`${index === currentIndex ? "current" : ""} ${visited.includes(question.id) ? "visited" : ""} ${isAnswered(question, answers[question.id]) ? "answered" : ""} ${marked.includes(question.id) ? "marked" : ""}${reviewStatus ? ` review-${reviewStatus}` : ""}`} onClick={() => goTo(index)}>{index + 1}</button>; })}</div>
        <div className="math-completion"><span>Bạn đã hoàn thành</span><strong><em>{answered}</em>/{questions.length} <small>câu</small></strong><div className="math-completion-track" role="progressbar" aria-label="Tiến độ làm bài" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answered}><i style={{ width: `${questions.length ? answered / questions.length * 100 : 0}%` }} /></div><b>{questions.length ? Math.round(answered / questions.length * 100) : 0}%</b></div>
        <p className="server-connected"><i /> Đã kết nối máy chủ</p>
      </aside>
      {showSubmit && <SubmitMathModal answered={answered} total={questions.length} timedOut={showSubmit === "timeout"} submitting={submitting} error={submitError} onContinue={() => { if (!submitting) setShowSubmit(null); }} onSubmit={submitPart} />}
    </div>
  );
}
