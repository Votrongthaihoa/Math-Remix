"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, BookOpen, CheckSquare, ChevronRight, Eye, FilePlus2, Filter, Folder, Library, Link2, Pencil, Plus, RefreshCw, Save, Search, Tags, Upload, X } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import { listenForProductNavigation } from "./product-navigation-guard";
import { QUESTION_FORMATS, questionTypeLabel, type QuestionType } from "../lib/exam-config";
import { buildLatexQuestionPreview, type LatexImportPreview } from "../lib/question-bank-latex";
import {
  QUESTION_BANK_DIFFICULTIES,
  normalizeQuestionBankContent,
  normalizeTags,
  validateQuestionBankContent,
  type QuestionBank,
  type QuestionBankContentField,
  type QuestionBankContentFieldErrors,
  type QuestionBankDifficulty,
  type QuestionBankItem,
  type QuestionBankNode,
  type QuestionBankSourceExam,
  type QuestionBankSourceSection,
} from "../lib/question-bank";
import LoadingIndicator from "./loading-indicator";
import QuestionBankItemPreview from "./question-bank-item-preview";
import "./admin-question-bank.css";
import "./admin-question-bank-workspace.css";

type Navigate = (path: string) => void;
type BankForm = { name: string; subjectCode: string; grade: string; curriculum: string; description: string };
type NodeForm = { title: string; parentId: string; nodeType: "topic" | "unit" };
type ItemForm = {
  prompt: string;
  questionType: QuestionType;
  options: string;
  correctAnswer: string;
  explanation: string;
  passage: string;
  mediaUrl: string;
  instruction: string;
  solutionSource: string;
  difficulty: QuestionBankDifficulty | "";
  tags: string;
  nodeId: string;
};

type PotentialDuplicate = {
  id: string;
  prompt: string;
  questionType: string | null;
  similarity: number;
};

type InvalidQuestionItem = {
  itemId?: string;
  index?: number;
  fieldErrors: QuestionBankContentFieldErrors;
};

type ItemFormField = QuestionBankContentField;
type PendingOperation = "bank" | "node" | "item" | "latex" | "seed" | "attach";

type Payload = {
  banks?: QuestionBank[];
  bank?: QuestionBank;
  nodes?: QuestionBankNode[];
  items?: QuestionBankItem[];
  sourceExams?: QuestionBankSourceExam[];
  sourceSections?: QuestionBankSourceSection[];
  canManageExams?: boolean;
  code?: string;
  potentialDuplicates?: PotentialDuplicate[];
  fieldErrors?: QuestionBankContentFieldErrors;
  invalidItems?: InvalidQuestionItem[];
  invalidIndexes?: number[];
  error?: string;
};

class PotentialDuplicateError extends Error {
  constructor(message: string, readonly candidates: PotentialDuplicate[]) {
    super(message);
    this.name = "PotentialDuplicateError";
  }
}

class InvalidQuestionContentError extends Error {
  constructor(message: string, readonly fieldErrors: QuestionBankContentFieldErrors, readonly invalidItems: InvalidQuestionItem[] = []) {
    super(message);
    this.name = "InvalidQuestionContentError";
  }
}

function indexedInvalidItems(value: readonly InvalidQuestionItem[]) {
  return value.filter((item): item is InvalidQuestionItem & { index: number } => item.index !== undefined);
}

function invalidItemMessage(item: InvalidQuestionItem) {
  const messages = Object.values(item.fieldErrors).filter(Boolean);
  return messages.length ? messages.join(" ") : "Dá»¯ liá»‡u cÃ¢u há»i chÆ°a Ä‘á»§ Ä‘á»ƒ lÆ°u.";
}

function potentialDuplicatesFrom(value: unknown): PotentialDuplicate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(candidate => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.prompt !== "string" || typeof row.similarity !== "number") return [];
    return [{
      id: row.id,
      prompt: row.prompt,
      questionType: typeof row.questionType === "string" ? row.questionType : null,
      similarity: row.similarity,
    }];
  });
}

function fieldErrorsFrom(value: unknown): QuestionBankContentFieldErrors {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const errors = value as Record<string, unknown>;
  return (["questionType", "prompt", "options", "correctAnswer", "mediaUrl"] as const).reduce<QuestionBankContentFieldErrors>((result, field) => {
    if (typeof errors[field] === "string" && errors[field].trim()) result[field] = errors[field].trim();
    return result;
  }, {});
}

function invalidItemsFrom(value: unknown): InvalidQuestionItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const itemId = typeof row.itemId === "string" && row.itemId.trim() ? row.itemId.trim() : undefined;
    const index = Number.isInteger(row.index) && Number(row.index) >= 0 ? Number(row.index) : undefined;
    if (!itemId && index === undefined) return [];
    return [{ itemId, index, fieldErrors: fieldErrorsFrom(row.fieldErrors) }];
  });
}

const emptyBankForm: BankForm = { name: "", subjectCode: "", grade: "", curriculum: "", description: "" };
const emptyNodeForm: NodeForm = { title: "", parentId: "", nodeType: "topic" };
const emptyItemForm: ItemForm = {
  prompt: "",
  questionType: "single",
  options: "A |\nB |\nC |\nD |",
  correctAnswer: "A",
  explanation: "",
  passage: "",
  mediaUrl: "",
  instruction: "",
  solutionSource: "",
  difficulty: "",
  tags: "",
  nodeId: "",
};

const itemValidationFields: readonly ItemFormField[] = ["questionType", "prompt", "options", "correctAnswer", "mediaUrl"];
const MAX_ATTACH_ITEMS = 200;
const answerArrayQuestionTypes = new Set<QuestionType>(["multiple", "inline", "true_false", "ordering", "drag_drop"]);
const optionQuestionTypes = new Set<QuestionType>(["single", "multiple", "true_false", "ordering", "drag_drop"]);

function parseOptions(value: string) {
  return value.split("\n").map((line, index) => {
    const [rawValue, ...labelParts] = line.split("|");
    const optionValue = rawValue.trim() || String.fromCharCode(65 + index);
    return { value: optionValue.slice(0, 20), label: labelParts.join("|").trim() };
  }).filter(option => option.label);
}

function parseAnswer(value: string, questionType: QuestionType) {
  const trimmed = value.trim();
  if (!answerArrayQuestionTypes.has(questionType)) return trimmed || null;
  // Inline answers are intentionally one per line. A comma remains valid
  // content (for example, Vietnamese decimal notation such as "3,14"), while
  // the option-oriented formats retain their compact comma-separated syntax.
  const values = (questionType === "inline" ? trimmed.split(/\r?\n/) : trimmed.split(","))
    .map(item => item.trim())
    .filter(Boolean);
  const normalized = questionType === "true_false" ? values.map(item => item.toLocaleLowerCase("en-US")) : values;
  return normalized;
}

function itemContentFromForm(itemForm: ItemForm) {
  return {
    prompt: itemForm.prompt,
    question_type: itemForm.questionType,
    // Keep a draft's option text locally when an author switches formats, but
    // do not persist answer choices for formats that cannot render them.
    options: optionQuestionTypes.has(itemForm.questionType) ? parseOptions(itemForm.options) : [],
    correct_answer: parseAnswer(itemForm.correctAnswer, itemForm.questionType),
    explanation: itemForm.explanation,
    passage: itemForm.passage,
    media_url: itemForm.mediaUrl,
    instruction: itemForm.instruction,
    solution_source: itemForm.solutionSource,
  };
}

function answerLabel(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : value === null || value === undefined ? "Chưa có" : String(value);
}

function answerInputValue(value: unknown, questionType: QuestionType) {
  if (Array.isArray(value)) return value.map(item => String(item)).join(questionType === "inline" ? "\n" : ", ");
  return value === null || value === undefined ? "" : String(value);
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("vi-VN") : "—";
}

function FieldError({ field, errors }: { field: ItemFormField; errors: QuestionBankContentFieldErrors }) {
  const message = errors[field];
  return message ? <span className="question-bank-field-error" id={`question-bank-${field}-error`}>{message}</span> : null;
}

export default function AdminQuestionBank({ navigate }: { navigate: Navigate }) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [nodes, setNodes] = useState<QuestionBankNode[]>([]);
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [sourceExams, setSourceExams] = useState<QuestionBankSourceExam[]>([]);
  const [sourceSections, setSourceSections] = useState<QuestionBankSourceSection[]>([]);
  const [canManageExams, setCanManageExams] = useState(false);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<QuestionBankDifficulty | "">("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectionLimitNotice, setSelectionLimitNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [bankLoading, setBankLoading] = useState(false);
  const [selectedBankLoadError, setSelectedBankLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [navigationBlockedNotice, setNavigationBlockedNotice] = useState("");
  const [catalogLoadError, setCatalogLoadError] = useState("");
  const [bankFormOpen, setBankFormOpen] = useState(false);
  const [nodeFormOpen, setNodeFormOpen] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<QuestionBankItem | null>(null);
  const [advancedFieldsOpen, setAdvancedFieldsOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [itemFormDirty, setItemFormDirty] = useState(false);
  const [importFormOpen, setImportFormOpen] = useState(false);
  const [attachFormOpen, setAttachFormOpen] = useState(false);
  const [bankForm, setBankForm] = useState<BankForm>(emptyBankForm);
  const [nodeForm, setNodeForm] = useState<NodeForm>(emptyNodeForm);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [seedNodeId, setSeedNodeId] = useState("");
  const [seedSectionId, setSeedSectionId] = useState("");
  const [seedInvalidItems, setSeedInvalidItems] = useState<InvalidQuestionItem[]>([]);
  const [attachExamId, setAttachExamId] = useState("");
  const [attachSectionId, setAttachSectionId] = useState("");
  const [attachInvalidItems, setAttachInvalidItems] = useState<InvalidQuestionItem[]>([]);
  const [latexSource, setLatexSource] = useState("");
  const [latexFileName, setLatexFileName] = useState("");
  const [latexPreview, setLatexPreview] = useState<LatexImportPreview | null>(null);
  const [latexNodeId, setLatexNodeId] = useState("");
  const [potentialDuplicates, setPotentialDuplicates] = useState<PotentialDuplicate[]>([]);
  const [itemFieldErrors, setItemFieldErrors] = useState<QuestionBankContentFieldErrors>({});
  const [selectedLatexIndexes, setSelectedLatexIndexes] = useState<Set<number>>(new Set());
  const itemFieldRefs = useRef<Partial<Record<ItemFormField, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>>({});
  const itemFormTriggerRef = useRef<HTMLElement | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const previewDialogRef = useRef<HTMLElement | null>(null);
  const previewCloseRef = useRef<HTMLButtonElement | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const nodeButtonRef = useRef<HTMLButtonElement | null>(null);
  const nodeTitleInputRef = useRef<HTMLInputElement | null>(null);
  const newItemButtonRef = useRef<HTMLButtonElement | null>(null);
  const importButtonRef = useRef<HTMLButtonElement | null>(null);
  const itemsRefreshButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedBankRetryButtonRef = useRef<HTMLButtonElement | null>(null);
  const catalogRetryButtonRef = useRef<HTMLButtonElement | null>(null);
  const createBankButtonRef = useRef<HTMLButtonElement | null>(null);
  const bankNameInputRef = useRef<HTMLInputElement | null>(null);
  const bankFormPostFocusRef = useRef<(() => void) | null>(null);
  const operationPostFocusRef = useRef<(() => void) | null>(null);
  const pendingOperationRef = useRef<PendingOperation | null>(null);
  const duplicateConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const advancedFieldsRef = useRef<HTMLDetailsElement | null>(null);
  const latexReadVersionRef = useRef(0);
  const latexFileInputRef = useRef<HTMLInputElement | null>(null);
  const catalogLoadVersionRef = useRef(0);
  const bankLoadVersionRef = useRef(0);
  const refreshVersionRef = useRef(0);
  const selectedBankIdRef = useRef("");
  const bankSaving = pendingOperation === "bank";
  const nodeSaving = pendingOperation === "node";
  const itemSaving = pendingOperation === "item";
  const importSaving = pendingOperation === "latex" || pendingOperation === "seed";
  const attachSaving = pendingOperation === "attach";

  const loadCatalog = useCallback(async () => {
    const requestVersion = ++catalogLoadVersionRef.current;
    try {
      const response = await authenticatedFetch("/api/admin/question-banks", { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (requestVersion !== catalogLoadVersionRef.current) return null;
      if (!response.ok) throw new Error(payload.error || "Không thể tải ngân hàng câu hỏi.");
      const nextBanks = payload.banks ?? [];
      const currentBankId = selectedBankIdRef.current;
      const nextBankId = currentBankId
        ? nextBanks.some(bank => bank.id === currentBankId) ? currentBankId : ""
        : nextBanks[0]?.id ?? "";
      setBanks(nextBanks);
      setSourceExams(payload.sourceExams ?? []);
      setSourceSections(payload.sourceSections ?? []);
      setCanManageExams(payload.canManageExams === true);
      setCatalogLoadError("");
      if (nextBankId !== currentBankId) bankLoadVersionRef.current += 1;
      if (nextBankId !== currentBankId) setSelectedBankLoadError("");
      selectedBankIdRef.current = nextBankId;
      setSelectedBankId(nextBankId);
      if (nextBankId !== currentBankId) setBankLoading(Boolean(nextBankId));
      return payload;
    } catch (value) {
      if (requestVersion !== catalogLoadVersionRef.current) return null;
      throw value;
    }
  }, []);

  const loadBank = useCallback(async (bankId: string) => {
    const requestVersion = ++bankLoadVersionRef.current;
    if (!bankId) {
      if (requestVersion === bankLoadVersionRef.current) {
        setSelectedBank(null); setNodes([]); setItems([]); setSelectedItemIds(new Set()); setSelectionLimitNotice(""); setSelectedBankLoadError("");
      }
      return false;
    }
    try {
      const response = await authenticatedFetch(`/api/admin/question-banks?bankId=${encodeURIComponent(bankId)}`, { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (requestVersion !== bankLoadVersionRef.current) return false;
      if (!response.ok) throw new Error(payload.error || "Không thể tải ngân hàng câu hỏi.");
      const nextItems = payload.items ?? [];
      const nextItemIds = new Set(nextItems.map(item => item.id));
      setSelectedBank(payload.bank ?? null);
      setNodes(payload.nodes ?? []);
      setItems(nextItems);
      setSourceExams(payload.sourceExams ?? []);
      setSourceSections(payload.sourceSections ?? []);
      setCanManageExams(payload.canManageExams === true);
      setSelectedItemIds(current => new Set([...current].filter(itemId => nextItemIds.has(itemId))));
      setSelectionLimitNotice("");
      setAttachInvalidItems(current => current.filter((item): item is InvalidQuestionItem & { itemId: string } => Boolean(item.itemId) && nextItemIds.has(item.itemId)));
      setSelectedBankLoadError("");
      return true;
    } catch (value) {
      if (requestVersion !== bankLoadVersionRef.current) return false;
      if (selectedBankIdRef.current === bankId) {
        setSelectedBank(null);
        setNodes([]);
        setItems([]);
        setSelectedBankLoadError(value instanceof Error ? value.message : "Không thể tải nội dung ngân hàng câu hỏi.");
      }
      throw value;
    }
  }, []);

  async function loadBankAfterCommit(bankId: string) {
    try {
      await loadBank(bankId);
    } catch {
      // The POST succeeded. loadBank already shows a retryable detail-load error.
    }
  }

  const refresh = useCallback(async (bankId: string) => {
    const requestVersion = ++refreshVersionRef.current;
    setLoading(true); setError("");
    try {
      try {
        const catalog = await loadCatalog();
        if (!catalog || requestVersion !== refreshVersionRef.current) return false;
      } catch {
        if (requestVersion === refreshVersionRef.current) {
          setCatalogLoadError("Chưa tải được danh sách ngân hàng. Kiểm tra kết nối rồi thử lại.");
        }
        return false;
      }
      if (bankId && bankId === selectedBankIdRef.current) {
        try {
          await loadBank(bankId);
        } catch {
          // The selected bank has its own retryable detail-load state.
          return false;
        }
      }
      return true;
    } finally {
      if (requestVersion === refreshVersionRef.current) setLoading(false);
    }
  }, [loadBank, loadCatalog]);

  async function retryCatalogLoad() {
    if (loading || saving) return;
    await refresh(selectedBankId);
    requestAnimationFrame(() => {
      if (!catalogRetryButtonRef.current?.isConnected) {
        (itemsRefreshButtonRef.current ?? selectedBankRetryButtonRef.current ?? createBankButtonRef.current)?.focus();
      }
    });
  }

  useEffect(() => {
    // Network-backed state is populated after the request resolves.
    void refresh("");
  }, [refresh]);
  useEffect(() => {
    if (selectedBankId) {
      let active = true;
      // Network-backed state is populated after the request resolves.
      setBankLoading(true);
      void loadBank(selectedBankId)
        .catch(() => undefined)
        .finally(() => {
          if (active && selectedBankIdRef.current === selectedBankId) setBankLoading(false);
        });
      return () => {
        active = false;
        bankLoadVersionRef.current += 1;
      };
    }
    bankLoadVersionRef.current += 1;
    setBankLoading(false);
  }, [loadBank, selectedBankId]);

  useEffect(() => {
    selectedBankIdRef.current = selectedBankId;
  }, [selectedBankId]);

  useEffect(() => {
    if (!attachFormOpen || selectedItemIds.size > 0) return;
    setAttachFormOpen(false);
    setAttachInvalidItems([]);
    setAttachExamId("");
    setAttachSectionId("");
  }, [attachFormOpen, selectedItemIds.size]);

  useEffect(() => () => {
    catalogLoadVersionRef.current += 1;
    bankLoadVersionRef.current += 1;
    refreshVersionRef.current += 1;
    latexReadVersionRef.current += 1;
  }, []);

  const selectedSections = useMemo(() => sourceSections.filter(section => section.exam_id === attachExamId), [attachExamId, sourceSections]);
  const seedSections = useMemo(() => sourceSections, [sourceSections]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi");
    return items.filter(item => {
      if (difficulty && item.difficulty !== difficulty) return false;
      if (selectedNodeId && item.node_id !== selectedNodeId) return false;
      if (!query) return true;
      return `${item.prompt} ${item.tags.join(" ")}`.toLocaleLowerCase("vi").includes(query);
    });
  }, [difficulty, items, search, selectedNodeId]);
  const visibleItemIds = useMemo(() => new Set(visibleItems.map(item => item.id)), [visibleItems]);
  const hiddenSelectedItemCount = useMemo(
    () => [...selectedItemIds].filter(itemId => !visibleItemIds.has(itemId)).length,
    [selectedItemIds, visibleItemIds],
  );
  const nodeOptions = useMemo(() => {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    return nodes.map(node => {
      const labels = [node.title];
      const visited = new Set([node.id]);
      let parentId = node.parent_id;
      while (parentId) {
        const parent = nodeById.get(parentId);
        if (!parent || visited.has(parent.id)) break;
        labels.unshift(parent.title);
        visited.add(parent.id);
        parentId = parent.parent_id;
      }
      return { id: node.id, label: labels.join(" → ") };
    });
  }, [nodes]);
  const validLatexItems = useMemo(() => latexPreview?.items.filter(item => item.errors.length === 0) ?? [], [latexPreview]);
  const selectedLatexValidIndexes = useMemo(
    () => validLatexItems.filter(item => selectedLatexIndexes.has(item.index)).map(item => item.index),
    [selectedLatexIndexes, validLatexItems],
  );
  const currentQuestionFormat = useMemo(
    () => QUESTION_FORMATS.find(format => format.value === itemForm.questionType) ?? QUESTION_FORMATS[0],
    [itemForm.questionType],
  );
  const currentQuestionUsesOptions = optionQuestionTypes.has(itemForm.questionType);
  const currentQuestionAnswerHint = itemForm.questionType === "inline"
    ? "Mỗi đáp án một dòng; dấu phẩy trong số thập phân được giữ nguyên."
    : currentQuestionFormat.answerHint;
  const currentQuestionGuide = itemForm.questionType === "inline"
    ? "Mỗi chuỗi ____ trong đề tạo một ô nhập; nhập một đáp án trên mỗi dòng theo đúng thứ tự các ô."
    : currentQuestionFormat.guide;
  const hasLatexPreviewWork = Boolean(latexSource || latexFileName || latexPreview || selectedLatexIndexes.size);
  const hasLatexImportWork = hasLatexPreviewWork || Boolean(latexNodeId);
  const hasImportWork = hasLatexImportWork || Boolean(seedNodeId || seedSectionId);
  const hasBankFormWork = bankFormOpen && Object.values(bankForm).some(value => value.trim());
  const hasAttachWork = selectedItemIds.size > 0 || Boolean(attachExamId || attachSectionId);
  const hasNodeFormWork = Boolean(nodeForm.title.trim() || nodeForm.parentId || nodeFormOpen && nodeForm.nodeType !== "topic");
  const hasQuestionBankUnsavedWork = Boolean(hasBankFormWork || itemFormDirty || hasImportWork || hasAttachWork || hasNodeFormWork);
  const selectedAttachInvalidItems = useMemo(() => {
    const itemById = new Map(items.map(item => [item.id, item]));
    return attachInvalidItems
      .filter((invalid): invalid is InvalidQuestionItem & { itemId: string } => Boolean(invalid.itemId) && selectedItemIds.has(invalid.itemId))
      .map(invalid => ({ ...invalid, item: itemById.get(invalid.itemId) }));
  }, [attachInvalidItems, items, selectedItemIds]);

  const closePreview = useCallback(() => {
    setPreviewItem(null);
    requestAnimationFrame(() => {
      const trigger = previewTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
      previewTriggerRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (!hasQuestionBankUnsavedWork && !pendingOperation) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasQuestionBankUnsavedWork, pendingOperation]);

  useEffect(() => {
    if (!hasQuestionBankUnsavedWork && !pendingOperation) return;
    return listenForProductNavigation(event => {
      // For popstate the browser URL already points at the destination here.
      // Only the same bank page can keep this component and its draft mounted.
      if (new URL(event.detail.path, window.location.origin).pathname === "/admin/question-bank") return;
      if (pendingOperation) {
        event.preventDefault();
        setNavigationBlockedNotice("Đang lưu dữ liệu. Hãy đợi hoàn tất trước khi rời trang.");
        return;
      }
      if (!window.confirm("Bạn có bản nháp hoặc lựa chọn chưa lưu trong ngân hàng câu hỏi. Rời trang sẽ bỏ chúng. Bạn vẫn muốn rời trang?")) {
        event.preventDefault();
      }
    });
  }, [hasQuestionBankUnsavedWork, pendingOperation]);

  useEffect(() => {
    if (!previewItem) return;
    const root = pageRootRef.current;
    const dialog = previewDialogRef.current;
    const previousOverflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => previewCloseRef.current?.focus());

    function handlePreviewKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter(element => !element.hidden && element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handlePreviewKeyDown);
    return () => {
      document.removeEventListener("keydown", handlePreviewKeyDown);
      if (root) root.inert = false;
      document.body.style.overflow = previousOverflow;
    };
  }, [closePreview, previewItem]);

  useEffect(() => {
    if (saving || !bankFormPostFocusRef.current) return;
    const restoreFocus = bankFormPostFocusRef.current;
    bankFormPostFocusRef.current = null;
    requestAnimationFrame(restoreFocus);
  }, [saving]);

  useEffect(() => {
    if (pendingOperation || !operationPostFocusRef.current) return;
    const restoreFocus = operationPostFocusRef.current;
    operationPostFocusRef.current = null;
    requestAnimationFrame(restoreFocus);
  }, [pendingOperation]);

  function beginOperation(operation: PendingOperation) {
    if (pendingOperationRef.current) return false;
    pendingOperationRef.current = operation;
    setPendingOperation(operation);
    setSaving(true);
    return true;
  }

  function finishOperation() {
    pendingOperationRef.current = null;
    setPendingOperation(null);
    setSaving(false);
    setNavigationBlockedNotice("");
  }

  function openPreview(item: QuestionBankItem, trigger?: HTMLElement) {
    if (saving || pendingOperationRef.current) return;
    previewTriggerRef.current = trigger ?? null;
    setPreviewItem(item);
  }

  function setField<K extends keyof BankForm>(key: K, value: BankForm[K]) {
    if (pendingOperationRef.current === "bank") return;
    setBankForm(previous => ({ ...previous, [key]: value }));
  }
  function setItemField<K extends keyof ItemForm>(key: K, value: ItemForm[K]) {
    if (pendingOperationRef.current === "item") return;
    if (key === "prompt" || key === "questionType") setPotentialDuplicates([]);
    if (key === "questionType") setItemFieldErrors({});
    const validationField = itemValidationFields.find(field => field === key);
    if (validationField && key !== "questionType") {
      setItemFieldErrors(previous => {
        if (!previous[validationField]) return previous;
        const next = { ...previous };
        delete next[validationField];
        return next;
      });
    }
    setItemFormDirty(true);
    setItemForm(previous => ({ ...previous, [key]: value }));
  }

  function focusFirstInvalidItemField(fieldErrors: QuestionBankContentFieldErrors) {
    const firstField = itemValidationFields.find(field => Boolean(fieldErrors[field]));
    if (firstField === "mediaUrl") {
      setAdvancedFieldsOpen(true);
      if (advancedFieldsRef.current) advancedFieldsRef.current.open = true;
    }
    if (firstField) requestAnimationFrame(() => itemFieldRefs.current[firstField]?.focus());
  }

  function restoreItemEditorFocus() {
    requestAnimationFrame(() => {
      const target = itemFormTriggerRef.current?.isConnected ? itemFormTriggerRef.current : newItemButtonRef.current;
      target?.focus();
    });
  }

  async function post(body: Record<string, unknown>) {
    const response = await authenticatedFetch("/api/admin/question-banks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as Payload & { imported?: number; attached?: number; bank?: QuestionBank };
    if (!response.ok) {
      const candidates = potentialDuplicatesFrom(payload.potentialDuplicates);
      if (response.status === 409 && payload.code === "potential_duplicates" && candidates.length) {
        throw new PotentialDuplicateError(payload.error || "Tìm thấy câu hỏi có nội dung gần giống.", candidates);
      }
      if (response.status === 422 && payload.code === "invalid_question_content") {
        throw new InvalidQuestionContentError(payload.error || "Câu hỏi chưa đủ dữ liệu để lưu hoặc đưa vào đề.", fieldErrorsFrom(payload.fieldErrors), invalidItemsFrom(payload.invalidItems));
      }
      throw new Error(payload.error || "Không thể lưu dữ liệu.");
    }
    return payload;
  }

  async function createBank(event: FormEvent) {
    event.preventDefault();
    if (saving || !beginOperation("bank")) return;
    const autoSelectNewBank = !itemFormOpen && !nodeFormOpen && !importFormOpen && !attachFormOpen
      && !itemFormDirty && !hasImportWork && !hasAttachWork && !hasNodeFormWork;
    const submitFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(""); setNotice("");
    let formClosed = false;
    try {
      const payload = await post({ action: "create_bank", name: bankForm.name, subjectCode: bankForm.subjectCode, grade: bankForm.grade, curriculum: bankForm.curriculum, description: bankForm.description });
      setBankForm(emptyBankForm); setBankFormOpen(false);
      formClosed = true;
      const successNotice = autoSelectNewBank
        ? "Đã tạo ngân hàng câu hỏi."
        : "Đã tạo ngân hàng câu hỏi. Chọn ngân hàng mới trong danh sách để tiếp tục.";
      setNotice(successNotice);
      try {
        const catalog = await loadCatalog();
        if (catalog && payload.bank?.id && autoSelectNewBank) {
          selectBank(payload.bank.id, true);
          // Switching banks clears stale feedback; retain this successful POST notice.
          setNotice(successNotice);
        }
      } catch {
        // The bank exists already. Retry only the GET, never the create POST.
        setCatalogLoadError("Đã lưu, nhưng chưa thể tải lại danh sách ngân hàng.");
      }
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể tạo ngân hàng."); }
    finally {
      bankFormPostFocusRef.current = () => {
        if (formClosed) createBankButtonRef.current?.focus();
        else if (submitFocus?.isConnected && !submitFocus.matches(":disabled")) submitFocus.focus();
        else bankNameInputRef.current?.focus();
      };
      finishOperation();
    }
  }

  async function createNode(event: FormEvent) {
    event.preventDefault();
    if (saving || !selectedBankId || !beginOperation("node")) return;
    const submitFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let formClosed = false;
    setError(""); setNotice("");
    try {
      await post({ action: "create_node", bankId: selectedBankId, title: nodeForm.title, parentId: nodeForm.parentId || null, nodeType: nodeForm.nodeType });
      formClosed = true;
      setNodeForm(emptyNodeForm); setNodeFormOpen(false); setNotice("Đã thêm chủ đề."); await loadBankAfterCommit(selectedBankId);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể thêm chủ đề."); }
    finally {
      operationPostFocusRef.current = () => {
        if (formClosed) nodeButtonRef.current?.focus();
        else if (submitFocus?.isConnected && !submitFocus.matches(":disabled")) submitFocus.focus();
      };
      finishOperation();
    }
  }

  async function saveItem(allowPotentialDuplicates = false) {
    if (saving || pendingOperationRef.current || !selectedBankId) return;
    setError(""); setNotice("");
    const content = itemContentFromForm(itemForm);
    const validation = validateQuestionBankContent(normalizeQuestionBankContent(content));
    if (!validation.valid) {
      setPotentialDuplicates([]);
      setItemFieldErrors(validation.fieldErrors);
      focusFirstInvalidItemField(validation.fieldErrors);
      return;
    }
    const submitFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let focusAfterSave: (() => void) | null = null;
    if (!beginOperation("item")) return;
    try {
      await post({
        action: editingItemId ? "update_item" : "create_item",
        itemId: editingItemId || undefined,
        bankId: selectedBankId,
        parentId: itemForm.nodeId || null,
        difficulty: itemForm.difficulty || null,
        tags: normalizeTags(itemForm.tags),
        allowPotentialDuplicates,
        content,
      });
      const wasEditing = Boolean(editingItemId);
      focusAfterSave = restoreItemEditorFocus;
      setPotentialDuplicates([]); setItemFieldErrors({}); setItemFormDirty(false); setItemForm(emptyItemForm); setEditingItemId(""); setItemFormOpen(false); setNotice(wasEditing ? "Đã lưu phiên bản câu hỏi mới." : "Đã thêm câu hỏi phiên bản 1."); await loadBankAfterCommit(selectedBankId);
    } catch (value) {
      if (value instanceof PotentialDuplicateError) {
        setPotentialDuplicates(value.candidates);
        focusAfterSave = () => duplicateConfirmButtonRef.current?.focus();
        return;
      }
      if (value instanceof InvalidQuestionContentError) {
        setPotentialDuplicates([]);
        setItemFieldErrors(value.fieldErrors);
        if (Object.keys(value.fieldErrors).length) focusAfterSave = () => focusFirstInvalidItemField(value.fieldErrors);
        else setError(value.message);
        return;
      }
      setError(value instanceof Error ? value.message : "Không thể thêm câu hỏi.");
    }
    finally {
      operationPostFocusRef.current = focusAfterSave ?? (() => {
        if (submitFocus?.isConnected && !submitFocus.matches(":disabled")) submitFocus.focus();
      });
      finishOperation();
    }
  }

  async function createItem(event: FormEvent) {
    event.preventDefault();
    await saveItem();
  }

  async function seedFromSection(event: FormEvent) {
    event.preventDefault(); if (saving || pendingOperationRef.current || !canManageExams || !selectedBankId || !seedSectionId) return;
    if (hasLatexImportWork && !confirmDiscard("Bạn có nội dung đích LaTeX chưa lưu. Nạp từ đề sẽ bỏ lựa chọn đó. Tiếp tục?")) return;
    const submitFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let formClosed = false;
    if (!beginOperation("seed")) return;
    setError(""); setNotice("");
    setSeedInvalidItems([]);
    try {
      const payload = await post({ action: "seed_from_section", bankId: selectedBankId, sectionId: seedSectionId, parentId: seedNodeId || null });
      formClosed = true;
      resetImportForm(); setImportFormOpen(false); setNotice(`Đã nạp ${payload.imported ?? 0} câu hỏi vào ngân hàng.`); await loadBankAfterCommit(selectedBankId);
    } catch (value) {
      if (value instanceof InvalidQuestionContentError && value.invalidItems.length) {
        setSeedInvalidItems(value.invalidItems);
        setError(value.message);
      } else {
        setError(value instanceof Error ? value.message : "Không thể nạp câu hỏi.");
      }
    }
    finally {
      operationPostFocusRef.current = () => {
        if (formClosed) importButtonRef.current?.focus();
        else if (submitFocus?.isConnected && !submitFocus.matches(":disabled")) submitFocus.focus();
      };
      finishOperation();
    }
  }

  function resetLatexImport() {
    latexReadVersionRef.current += 1;
    setLatexSource("");
    setLatexFileName("");
    setLatexPreview(null);
    setLatexNodeId("");
    setSelectedLatexIndexes(new Set());
    if (latexFileInputRef.current) latexFileInputRef.current.value = "";
  }

  function resetImportForm() {
    resetLatexImport();
    setSeedNodeId("");
    setSeedSectionId("");
    setSeedInvalidItems([]);
  }

  async function readLatexFile(file: File | undefined) {
    const readVersion = latexReadVersionRef.current + 1;
    latexReadVersionRef.current = readVersion;
    setError("");
    setNotice("");
    setLatexSource("");
    setLatexFileName(file?.name ?? "");
    setLatexPreview(null);
    setSelectedLatexIndexes(new Set());
    if (!file) return;
    if (!file.name.toLocaleLowerCase("vi").endsWith(".tex")) {
      setLatexPreview({ items: [], fileError: "Chỉ chấp nhận tệp .tex." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLatexPreview({ items: [], fileError: "Tệp LaTeX không được vượt quá 5 MB." });
      return;
    }
    try {
      const source = await file.text();
      if (readVersion !== latexReadVersionRef.current) return;
      const preview = buildLatexQuestionPreview(source);
      setLatexFileName(file.name);
      setLatexSource(source);
      setLatexPreview(preview);
      setSelectedLatexIndexes(new Set(preview.items.filter(item => item.errors.length === 0).map(item => item.index)));
    } catch {
      if (readVersion !== latexReadVersionRef.current) return;
      setLatexFileName(file.name);
      setLatexSource("");
      setLatexPreview({ items: [], fileError: "Không thể đọc tệp LaTeX này." });
    }
  }

  function handleLatexFileChange(file: File | undefined) {
    if (importSaving || pendingOperationRef.current === "latex" || pendingOperationRef.current === "seed") return;
    if (hasLatexPreviewWork && !confirmDiscard("Bạn có bản xem trước LaTeX chưa lưu. Thay tệp sẽ bỏ bản xem trước này. Tiếp tục?")) {
      if (latexFileInputRef.current) latexFileInputRef.current.value = "";
      return;
    }
    void readLatexFile(file);
  }

  function applyLatexValidationErrors(invalidItems: readonly InvalidQuestionItem[]) {
    const indexedItems = indexedInvalidItems(invalidItems);
    if (!indexedItems.length) return null;
    const byIndex = new Map(indexedItems.map(item => [item.index, item]));
    setLatexPreview(current => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map(item => {
          const invalid = byIndex.get(item.index);
          if (!invalid) return item;
          const nextErrors = [...item.errors, invalidItemMessage(invalid)].filter(Boolean);
          return { ...item, errors: Array.from(new Set(nextErrors)) };
        }),
      };
    });
    setSelectedLatexIndexes(current => new Set([...current].filter(index => !byIndex.has(index))));
    return indexedItems[0].index;
  }

  async function importLatex(event: FormEvent) {
    event.preventDefault();
    if (saving || pendingOperationRef.current || !selectedBankId || !latexPreview || latexPreview.fileError) return;
    const importIndexes = selectedLatexValidIndexes;
    if (!importIndexes.length) {
      setError("Chọn ít nhất một câu hỏi hợp lệ để lưu.");
      return;
    }
    if ((seedNodeId || seedSectionId) && !confirmDiscard("Bạn có lựa chọn nạp từ đề chưa lưu. Lưu LaTeX sẽ bỏ lựa chọn này. Tiếp tục?")) return;
    const submitFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let formClosed = false;
    let invalidPreviewIndex: number | null = null;
    if (!beginOperation("latex")) return;
    setError(""); setNotice("");
    try {
      const payload = await post({
        action: "import_latex",
        bankId: selectedBankId,
        latexSource,
        importIndexes,
        parentId: latexNodeId || null,
      });
      setNotice(`Đã lưu ${payload.imported ?? importIndexes.length} câu hỏi từ ${latexFileName || "tệp LaTeX"}.`);
      formClosed = true;
      resetImportForm();
      setImportFormOpen(false);
      await loadBankAfterCommit(selectedBankId);
    } catch (value) {
      if (value instanceof InvalidQuestionContentError) {
        invalidPreviewIndex = applyLatexValidationErrors(value.invalidItems);
        if (invalidPreviewIndex !== null) {
          setError(`${value.message} Các câu lỗi đã được bỏ chọn để bạn sửa hoặc bỏ qua trước khi thử lại.`);
        } else {
          setError(value.message);
        }
        return;
      }
      setError(value instanceof Error ? value.message : "Không thể lưu câu hỏi LaTeX.");
    } finally {
      operationPostFocusRef.current = () => {
        if (formClosed) importButtonRef.current?.focus();
        else if (invalidPreviewIndex !== null) document.querySelector<HTMLInputElement>(`[data-question-bank-latex-index="${invalidPreviewIndex}"] input`)?.focus();
        else if (submitFocus?.isConnected && !submitFocus.matches(":disabled")) submitFocus.focus();
      };
      finishOperation();
    }
  }

  async function attachToExam(event: FormEvent) {
    event.preventDefault(); if (saving || pendingOperationRef.current || !canManageExams || !selectedBankId || !attachExamId || !attachSectionId || selectedItemIds.size === 0) return;
    if (hiddenSelectedItemCount > 0 && !confirmDiscard(`${hiddenSelectedItemCount} câu đã chọn đang bị bộ lọc ẩn. Các câu này cũng sẽ được thêm vào đề nháp. Tiếp tục?`)) return;
    if (selectedAttachInvalidItems.length) {
      setError("Bỏ chọn hoặc sửa các câu được đánh dấu trước khi đưa vào đề.");
      return;
    }
    const submitFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let formClosed = false;
    if (!beginOperation("attach")) return;
    setError(""); setNotice("");
    try {
      const payload = await post({ action: "attach_to_exam", bankId: selectedBankId, examId: attachExamId, sectionId: attachSectionId, itemIds: [...selectedItemIds] });
      formClosed = true;
      setAttachFormOpen(false); setAttachInvalidItems([]); setSelectedItemIds(new Set()); setAttachExamId(""); setAttachSectionId(""); setNotice(`Đã thêm ${payload.attached ?? 0} câu vào đề.`);
    } catch (value) {
      if (value instanceof InvalidQuestionContentError && value.invalidItems.length) {
        setAttachInvalidItems(value.invalidItems);
        return;
      }
      setError(value instanceof Error ? value.message : "Không thể thêm câu vào đề.");
    }
    finally {
      operationPostFocusRef.current = () => {
        if (formClosed) itemsRefreshButtonRef.current?.focus();
        else if (submitFocus?.isConnected && !submitFocus.matches(":disabled")) submitFocus.focus();
      };
      finishOperation();
    }
  }

  function toggleItem(id: string) {
    if (pendingOperationRef.current) return;
    setAttachInvalidItems(current => current.filter(item => item.itemId !== id));
    setSelectedItemIds(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setSelectionLimitNotice("");
      } else if (next.size >= MAX_ATTACH_ITEMS) {
        setSelectionLimitNotice(`Chỉ có thể chọn tối đa ${MAX_ATTACH_ITEMS} câu cho một lần đưa vào đề. Bỏ chọn một câu trước khi chọn thêm.`);
        return next;
      } else {
        next.add(id);
        setSelectionLimitNotice("");
      }
      return next;
    });
  }

  function toggleLatexImportSelection(index: number) {
    if (importSaving || pendingOperationRef.current === "latex" || pendingOperationRef.current === "seed") return;
    setSelectedLatexIndexes(current => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function confirmDiscard(message = "Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?") {
    return window.confirm(message);
  }

  function discardNodeForm() {
    setNodeForm(emptyNodeForm);
    setNodeFormOpen(false);
  }

  function closeNodeForm() {
    if (pendingOperationRef.current === "node") return false;
    if (hasNodeFormWork && !confirmDiscard("Bạn có chủ đề chưa lưu. Bỏ thay đổi này?")) return false;
    discardNodeForm();
    requestAnimationFrame(() => nodeButtonRef.current?.focus());
    return true;
  }

  function toggleNodeForm() {
    if (pendingOperationRef.current) return;
    if (nodeFormOpen) {
      closeNodeForm();
      return;
    }
    setNodeForm(emptyNodeForm);
    setNodeFormOpen(true);
    requestAnimationFrame(() => nodeTitleInputRef.current?.focus());
  }

  function discardItemForm() {
    setPotentialDuplicates([]);
    setItemFieldErrors({});
    setItemFormDirty(false);
    setItemFormOpen(false);
    setAdvancedFieldsOpen(false);
    setEditingItemId("");
    setItemForm(emptyItemForm);
  }

  function closeItemForm() {
    if (saving) return false;
    if (itemFormDirty && !confirmDiscard()) return false;
    discardItemForm();
    restoreItemEditorFocus();
    return true;
  }

  function focusItemEditor(trigger?: HTMLElement) {
    if (trigger) {
      itemFormTriggerRef.current = trigger;
    } else if (document.activeElement instanceof HTMLElement && !document.activeElement.closest(".question-bank-editor")) {
      itemFormTriggerRef.current = document.activeElement;
    }
    requestAnimationFrame(() => itemFieldRefs.current.prompt?.focus());
  }

  function openNewItemForm(event?: { currentTarget: HTMLElement }) {
    if (saving) return;
    if (itemFormDirty && !confirmDiscard()) return;
    setPotentialDuplicates([]);
    setItemFieldErrors({});
    setItemFormDirty(false);
    setEditingItemId("");
    setItemForm(emptyItemForm);
    setItemFormOpen(true);
    focusItemEditor(event?.currentTarget);
  }

  function openBankForm() {
    if (saving) return;
    setBankForm(emptyBankForm);
    setBankFormOpen(true);
    requestAnimationFrame(() => bankNameInputRef.current?.focus());
  }

  function toggleBankForm() {
    if (saving) return;
    if (bankFormOpen) {
      closeBankForm();
      return;
    }
    openBankForm();
  }

  function closeBankForm() {
    if (saving || pendingOperationRef.current) return false;
    if (hasBankFormWork && !confirmDiscard("Bạn có ngân hàng chưa lưu. Bỏ thay đổi này?")) return false;
    setBankForm(emptyBankForm);
    setBankFormOpen(false);
    requestAnimationFrame(() => createBankButtonRef.current?.focus());
    return true;
  }

  function toggleImportForm() {
    if (pendingOperationRef.current) return;
    if (importFormOpen) {
      if (hasImportWork && !confirmDiscard("Bạn có nội dung nạp câu hỏi chưa lưu. Bỏ nội dung này?")) return;
      setImportFormOpen(false);
      resetImportForm();
      requestAnimationFrame(() => importButtonRef.current?.focus());
      return;
    }
    resetImportForm();
    setImportFormOpen(true);
    requestAnimationFrame(() => latexFileInputRef.current?.focus());
  }

  function toggleAttachForm() {
    if (pendingOperationRef.current) return;
    if (!attachFormOpen) {
      setAttachInvalidItems([]);
      setAttachFormOpen(true);
      return;
    }
    if (hasAttachWork && !confirmDiscard("Bạn đang chọn câu hỏi để đưa vào đề. Đóng biểu mẫu sẽ bỏ các lựa chọn này. Tiếp tục?")) return;
    setAttachFormOpen(false);
    setAttachInvalidItems([]);
    setSelectedItemIds(new Set());
    setSelectionLimitNotice("");
    setAttachExamId("");
    setAttachSectionId("");
  }

  function retrySelectedBank() {
    if (!selectedBankId || bankLoading) return;
    setError("");
    setSelectedBankLoadError("");
    setBankLoading(true);
    void loadBank(selectedBankId)
      .catch(() => undefined)
      .finally(() => {
        if (selectedBankIdRef.current === selectedBankId) setBankLoading(false);
      });
  }

  function selectBank(bankId: string, skipDiscardConfirmation = false) {
    if (!bankId) return;
    if (bankId === selectedBankId) {
      if (selectedBankLoadError) retrySelectedBank();
      return;
    }
    if (!skipDiscardConfirmation && hasQuestionBankUnsavedWork && !confirmDiscard("Bạn có bản nháp, lựa chọn hoặc nội dung chưa lưu trong ngân hàng hiện tại. Chuyển ngân hàng sẽ bỏ chúng. Tiếp tục?")) return;
    catalogLoadVersionRef.current += 1;
    bankLoadVersionRef.current += 1;
    refreshVersionRef.current += 1;
    setBankLoading(true);
    setSelectedBank(null);
    setNodes([]);
    setItems([]);
    setSelectedNodeId("");
    setSelectedItemIds(new Set());
    setSelectionLimitNotice("");
    setBankForm(emptyBankForm);
    setBankFormOpen(false);
    setAttachInvalidItems([]);
    discardNodeForm();
    discardItemForm();
    resetImportForm();
    setImportFormOpen(false);
    setSeedNodeId("");
    setSeedSectionId("");
    setAttachFormOpen(false);
    setAttachExamId("");
    setAttachSectionId("");
    setSelectedBankLoadError("");
    setError("");
    setNotice("");
    selectedBankIdRef.current = bankId;
    setSelectedBankId(bankId);
  }

  function editItem(item: QuestionBankItem, trigger?: HTMLElement) {
    if (saving || pendingOperationRef.current) return;
    if (itemFormOpen && editingItemId === item.id) {
      focusItemEditor(trigger);
      return;
    }
    if (itemFormDirty && !confirmDiscard()) return;
    setPotentialDuplicates([]);
    setItemFieldErrors({});
    setEditingItemId(item.id);
    setAdvancedFieldsOpen(false);
    setItemForm({
      prompt: item.prompt,
      questionType: item.question_type,
      options: item.options.map(option => `${option.value} | ${option.label}`).join("\n"),
      correctAnswer: answerInputValue(item.correct_answer, item.question_type),
      explanation: item.explanation,
      passage: item.passage ?? "",
      mediaUrl: item.media_url ?? "",
      instruction: item.instruction ?? "",
      solutionSource: item.solution_source,
      difficulty: item.difficulty ?? "",
      tags: item.tags.join(", "),
      nodeId: item.node_id ?? "",
    });
    setItemFormDirty(false);
    setItemFormOpen(true);
    focusItemEditor(trigger);
  }

  function renderNodes(parentId: string | null, depth = 0): ReactNode {
    return nodes.filter(node => node.parent_id === parentId).map(node => <div key={node.id}>
      <button type="button" className={`question-bank-node ${selectedNodeId === node.id ? "active" : ""}`} style={{ paddingInlineStart: `${12 + Math.min(depth, 4) * 12}px` }} onClick={() => setSelectedNodeId(current => current === node.id ? "" : node.id)} aria-pressed={selectedNodeId === node.id}>
        <Folder aria-hidden="true" /><b>{node.title}</b><small>{items.filter(item => item.node_id === node.id).length}</small>
      </button>
      {renderNodes(node.id, depth + 1)}
    </div>);
  }

  if (loading && !banks.length) return <LoadingIndicator label="Đang tải ngân hàng câu hỏi…" />;

  return <div ref={pageRootRef} className="question-bank-page question-bank-workspace">
    <header className="question-bank-header">
      <div>
        <span className="editor-eyebrow">Kho học liệu / Biên soạn</span>
        <h1>Ngân hàng câu hỏi</h1>
        <p>Tạo cấu trúc, phân loại và tái sử dụng câu hỏi để sinh đề nhanh hơn.</p>
      </div>
      <div className="question-bank-header-actions">
        {canManageExams && <a className="outline-btn" href={saving ? undefined : "/admin/exams"} aria-disabled={saving || undefined} onClick={event => {
          if (saving) { event.preventDefault(); return; }
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          navigate("/admin/exams");
        }}><FilePlus2 aria-hidden="true" /> Mở đề thi</a>}
        <button type="button" ref={createBankButtonRef} className="primary-btn small" onClick={toggleBankForm} disabled={saving}><Plus aria-hidden="true" /> Tạo ngân hàng</button>
      </div>
    </header>
    {error && <p className="form-error question-bank-alert" role="alert">{error}</p>}
    {notice && <p className="form-success question-bank-alert" role="status" aria-live="polite">{notice}</p>}
    {navigationBlockedNotice && <p className="question-bank-navigation-warning" role="status">{navigationBlockedNotice}</p>}
    {catalogLoadError && <div className="question-bank-catalog-warning" role="alert">
      <AlertTriangle aria-hidden="true" />
      <p>{catalogLoadError}</p>
      <button type="button" ref={catalogRetryButtonRef} className="outline-btn small" onClick={() => void retryCatalogLoad()} disabled={loading || saving}><RefreshCw aria-hidden="true" /> Thử tải lại</button>
    </div>}
    {bankFormOpen && <form className="question-bank-form question-bank-create-form" onSubmit={createBank}>
      <div className="question-bank-form-heading"><div><span className="eyebrow">NEW LIBRARY</span><h2>Tạo ngân hàng mới</h2></div><button type="button" className="icon-btn" onClick={closeBankForm} aria-label="Đóng form tạo ngân hàng" disabled={saving}><X aria-hidden="true" /></button></div>
      <div className="question-bank-form-grid">
        <label>Tên ngân hàng<input ref={bankNameInputRef} value={bankForm.name} onChange={event => setField("name", event.target.value)} placeholder="Ví dụ: Toán 12 · Hàm số" required disabled={bankSaving} /></label>
        <label>Môn học<input value={bankForm.subjectCode} onChange={event => setField("subjectCode", event.target.value)} placeholder="TOAN" disabled={bankSaving} /></label>
        <label>Khối<input value={bankForm.grade} onChange={event => setField("grade", event.target.value)} placeholder="12" disabled={bankSaving} /></label>
        <label>Chương trình / bộ sách<input value={bankForm.curriculum} onChange={event => setField("curriculum", event.target.value)} placeholder="CT 2018" disabled={bankSaving} /></label>
      </div>
      <label>Mô tả<textarea rows={2} value={bankForm.description} onChange={event => setField("description", event.target.value)} placeholder="Mục đích sử dụng và phạm vi kiến thức" disabled={bankSaving} /></label>
      <button className="primary-btn small" disabled={saving}><Save aria-hidden="true" /> {bankSaving ? "Đang tạo…" : "Lưu ngân hàng"}</button>
    </form>}
    <div className="question-bank-layout">
      <aside className="question-bank-sidebar" aria-label="Danh sách ngân hàng">
        <div className="question-bank-sidebar-heading"><span><Library aria-hidden="true" /> Ngân hàng</span><b>{banks.length}</b></div>
        <div className="question-bank-list">
          {banks.length ? banks.map(bank => <button type="button" key={bank.id} className={bank.id === selectedBankId ? "active" : ""} onClick={() => selectBank(bank.id)} aria-pressed={bank.id === selectedBankId} disabled={saving}><span><b>{bank.name}</b><small>{[bank.subject_code, bank.grade].filter(Boolean).join(" · ") || "Chưa phân loại"}</small></span><ChevronRight aria-hidden="true" /></button>) : <div className="question-bank-empty"><Library aria-hidden="true" /><p>Chưa có ngân hàng.</p><button type="button" className="outline-btn small" onClick={openBankForm} disabled={saving}>Tạo ngân hàng đầu tiên</button></div>}
        </div>
        {selectedBank?.id === selectedBankId && <div className="question-bank-node-panel" aria-label="Chủ đề trong ngân hàng">
          <div className="question-bank-panel-heading"><span><BookOpen aria-hidden="true" /> Chủ đề</span><b>{nodes.length}</b></div>
          <button type="button" className={`question-bank-node ${!selectedNodeId ? "active" : ""}`} onClick={() => setSelectedNodeId("")} aria-pressed={!selectedNodeId}><Library aria-hidden="true" /><b>Tất cả câu hỏi</b><small>{items.length}</small></button>
          {renderNodes(null)}
          {!nodes.length && <p className="question-bank-sidebar-hint">Tạo chủ đề để sắp xếp câu hỏi theo chương hoặc bài học.</p>}
        </div>}
      </aside>
      <section className="question-bank-stage" aria-label="Không gian làm việc ngân hàng câu hỏi">
        {selectedBank?.id === selectedBankId ? <>
          <header className="question-bank-stage-heading">
            <div><span className="eyebrow">{selectedBank.subject_code || "QUESTION BANK"} · {selectedBank.grade || "MỌI KHỐI"}</span><h2>{selectedBank.name}</h2><p>{selectedBank.description || "Chọn chủ đề để lọc hoặc thêm câu hỏi vào thư viện."}</p></div>
            <div className="question-bank-stage-meta"><span className={`question-bank-status ${selectedBank.status}`}>{selectedBank.status === "active" ? "Đang dùng" : selectedBank.status === "archived" ? "Đã lưu trữ" : "Bản nháp"}</span><small>Cập nhật {dateLabel(selectedBank.updated_at)}</small></div>
          </header>
          <div className="question-bank-actions-row">
            <span className="question-bank-workspace-count"><b>{items.length}</b> câu hỏi <span aria-hidden="true">·</span> {nodes.length} chủ đề</span>
            <button type="button" ref={nodeButtonRef} className="outline-btn small" onClick={toggleNodeForm} disabled={saving}><Tags aria-hidden="true" /> Chủ đề</button>
            <button type="button" ref={importButtonRef} className="outline-btn small" onClick={toggleImportForm} disabled={saving}><Upload aria-hidden="true" /> Nạp câu hỏi</button>
            <button type="button" ref={newItemButtonRef} className="primary-btn small" onClick={event => itemFormOpen ? closeItemForm() : openNewItemForm(event)} disabled={saving}><Plus aria-hidden="true" /> Thêm câu hỏi</button>
          </div>
          {nodeFormOpen && <form className="question-bank-inline-form" onSubmit={createNode}><div className="question-bank-inline-title"><b>Tạo cấu trúc chủ đề</b><button type="button" onClick={closeNodeForm} aria-label="Đóng form chủ đề" disabled={nodeSaving}><X aria-hidden="true" /></button></div><div className="question-bank-form-grid compact"><label>Tên chủ đề<input ref={nodeTitleInputRef} value={nodeForm.title} onChange={event => setNodeForm(previous => ({ ...previous, title: event.target.value }))} placeholder="Ví dụ: Đạo hàm" required disabled={nodeSaving} /></label><label>Chủ đề cha<select value={nodeForm.parentId} onChange={event => setNodeForm(previous => ({ ...previous, parentId: event.target.value }))} disabled={nodeSaving}><option value="">Cấp cao nhất</option>{nodes.filter(node => node.node_type === "topic").map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label><label>Kiểu cấu trúc<select value={nodeForm.nodeType} onChange={event => setNodeForm(previous => ({ ...previous, nodeType: event.target.value as NodeForm["nodeType"] }))} disabled={nodeSaving}><option value="topic">Chủ đề / chương</option><option value="unit">Đơn vị kiến thức</option></select></label></div><button className="primary-btn small" disabled={saving}><Save aria-hidden="true" /> {nodeSaving ? "Đang lưu…" : "Lưu chủ đề"}</button></form>}
          {importFormOpen && <div className="question-bank-inline-form question-bank-import-panel">
            <div className="question-bank-inline-title"><b>Nạp câu hỏi vào ngân hàng</b><button type="button" onClick={toggleImportForm} aria-label="Đóng form nạp câu hỏi" disabled={saving}><X aria-hidden="true" /></button></div>
            <p className="question-bank-help">Chọn tệp .tex để phân tích trước. Câu lỗi sẽ được đánh dấu, không được chọn và không được lưu.</p>
            <form className="question-bank-latex-form" onSubmit={importLatex}>
              <div className="question-bank-form-grid compact">
                <label htmlFor="question-bank-latex-file">Tệp LaTeX (.tex)<input id="question-bank-latex-file" ref={latexFileInputRef} type="file" accept=".tex,text/x-tex" onChange={event => handleLatexFileChange(event.target.files?.[0])} disabled={importSaving} /></label>
                <label htmlFor="question-bank-latex-node">Chủ đề đích<select id="question-bank-latex-node" value={latexNodeId} onChange={event => setLatexNodeId(event.target.value)} disabled={importSaving}><option value="">Chưa gán chủ đề</option>{nodeOptions.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
              </div>
              {latexFileName && <p className="question-bank-file-name" role="status">Đã chọn: <b>{latexFileName}</b></p>}
              <p className="question-bank-latex-selection-status" role="status" aria-live="polite" aria-atomic="true">{latexPreview && !latexPreview.fileError ? `Đã chọn ${selectedLatexValidIndexes.length}/${validLatexItems.length} câu hợp lệ.` : ""}</p>
              {latexPreview && <div className="question-bank-latex-preview">
                {latexPreview.fileError ? <p className="question-bank-latex-error" role="alert">{latexPreview.fileError}</p> : <>
                  <div className="question-bank-latex-preview-heading"><b>Xem trước {latexPreview.items.length} câu hỏi</b><span>{validLatexItems.length} hợp lệ · {latexPreview.items.length - validLatexItems.length} lỗi</span></div>
                  <div className="question-bank-latex-preview-list">
                    {latexPreview.items.map(item => {
                      const selectable = item.errors.length === 0;
                      const selected = selectable && selectedLatexIndexes.has(item.index);
                      return <article key={item.index} data-question-bank-latex-index={item.index} className={`question-bank-latex-preview-item ${item.errors.length ? "has-error" : ""} ${selected ? "is-selected" : ""}`}>
                        <div className="question-bank-latex-preview-meta">
                          {selectable && <label className="question-bank-latex-select"><input type="checkbox" checked={selected} onChange={() => toggleLatexImportSelection(item.index)} disabled={importSaving} /><span>Chọn câu {item.index + 1}</span></label>}
                          <div><b>Câu {item.index + 1}</b><span>{questionTypeLabel(item.question_type)}</span></div>
                        </div>
                        <p>{item.prompt || "(Câu hỏi không có nội dung)"}</p>
                        {item.errors.length > 0 && <ul>{item.errors.map(error => <li key={error}>{error}</li>)}</ul>}
                      </article>;
                    })}
                  </div>
                  {validLatexItems.length > 0 && <button type="submit" className="primary-btn small" disabled={saving || selectedLatexValidIndexes.length === 0}><Save aria-hidden="true" /> {importSaving ? "Đang lưu…" : `Lưu ${selectedLatexValidIndexes.length} câu đã chọn`}</button>}
                </>}
              </div>}
            </form>
            {canManageExams ? <>
              <div className="question-bank-import-divider" aria-hidden="true"><span>hoặc</span></div>
              <form onSubmit={seedFromSection}>
                <div className="question-bank-form-grid compact">
                  <label htmlFor="question-bank-source-section">Phần đề<select id="question-bank-source-section" value={seedSectionId} onChange={event => setSeedSectionId(event.target.value)} required disabled={importSaving}><option value="">Chọn section</option>{seedSections.map(section => <option key={section.id} value={section.id}>{sourceExams.find(exam => exam.id === section.exam_id)?.title || "Đề"} · {section.title}</option>)}</select></label>
                  <label htmlFor="question-bank-seed-node">Chủ đề đích<select id="question-bank-seed-node" value={seedNodeId} onChange={event => setSeedNodeId(event.target.value)} disabled={importSaving}><option value="">Chưa gán chủ đề</option>{nodeOptions.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
                </div>
                <button className="primary-btn small" disabled={saving || !seedSectionId}><Upload aria-hidden="true" /> {pendingOperation === "seed" ? "Đang nạp…" : "Nạp từ đề vào ngân hàng"}</button>
              </form>
              {seedInvalidItems.length > 0 && <div className="question-bank-seed-invalid" role="alert">
                <b>Một số câu trong section chưa thể nạp</b>
                <ul>{seedInvalidItems.map(item => <li key={item.index ?? item.itemId}><strong>Câu {item.index === undefined ? "?" : item.index + 1}</strong><span>{invalidItemMessage(item)}</span></li>)}</ul>
              </div>}
            </> : <p className="question-bank-import-permission">Nạp từ đề và đưa câu vào đề chỉ hiển thị với quyền quản lý đề thi.</p>}
          </div>}
          {itemFormOpen && <form className="question-bank-form question-bank-editor" onSubmit={createItem} noValidate>
            <div className="question-bank-form-heading">
              <div><span className="eyebrow">Biên soạn câu hỏi</span><h3>{editingItemId ? "Sửa câu hỏi" : "Thêm câu hỏi"}</h3></div>
              <button type="button" className="icon-btn" onClick={closeItemForm} aria-label="Đóng form câu hỏi" disabled={saving}><X aria-hidden="true" /></button>
            </div>
            <fieldset className="question-bank-editor-section" disabled={itemSaving}>
            <legend><span aria-hidden="true">01</span> Phân loại câu hỏi</legend>
            <div className="question-bank-form-grid">
              <label>Chủ đề<select value={itemForm.nodeId} onChange={event => setItemField("nodeId", event.target.value)}><option value="">Chưa gán</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
              <label htmlFor="question-bank-question-type">Loại câu hỏi<select id="question-bank-question-type" ref={element => { itemFieldRefs.current.questionType = element; }} value={itemForm.questionType} onChange={event => setItemField("questionType", event.target.value as QuestionType)} aria-invalid={itemFieldErrors.questionType ? true : undefined} aria-describedby={itemFieldErrors.questionType ? "question-bank-questionType-error" : undefined}>{QUESTION_FORMATS.map(format => <option key={format.value} value={format.value} disabled={format.value === "ordering"}>{format.label}{format.value === "ordering" ? " — chưa hỗ trợ trong Ngân hàng" : ""}</option>)}</select><FieldError field="questionType" errors={itemFieldErrors} /></label>
              <label>Độ khó<select value={itemForm.difficulty} onChange={event => setItemField("difficulty", event.target.value as ItemForm["difficulty"])}><option value="">Chưa gắn mức độ</option>{QUESTION_BANK_DIFFICULTIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Tag<input value={itemForm.tags} onChange={event => setItemField("tags", event.target.value)} placeholder="hàm số, đạo hàm" /></label>
            </div>
            </fieldset>
            <fieldset className="question-bank-editor-section" disabled={itemSaving}>
            <legend><span aria-hidden="true">02</span> Nội dung và đáp án</legend>
            <section className="question-bank-format-guide" aria-label={`Hướng dẫn dạng ${currentQuestionFormat.label}`}><b>{currentQuestionFormat.label}</b><p>{currentQuestionGuide}</p><code>{currentQuestionFormat.syntax}</code></section>
            <label htmlFor="question-bank-prompt">Nội dung câu hỏi<textarea id="question-bank-prompt" ref={element => { itemFieldRefs.current.prompt = element; }} rows={5} value={itemForm.prompt} onChange={event => setItemField("prompt", event.target.value)} placeholder="Có thể dùng LaTeX trong nội dung." required aria-invalid={itemFieldErrors.prompt ? true : undefined} aria-describedby={itemFieldErrors.prompt ? "question-bank-prompt-error" : undefined} /><FieldError field="prompt" errors={itemFieldErrors} /></label>
            <div className={`question-bank-form-grid question-bank-answer-grid ${currentQuestionUsesOptions ? "" : "is-answer-only"}`}>
              {currentQuestionUsesOptions && <label htmlFor="question-bank-options">Phương án <small>Mỗi dòng: A | Nội dung</small><textarea id="question-bank-options" ref={element => { itemFieldRefs.current.options = element; }} rows={4} value={itemForm.options} onChange={event => setItemField("options", event.target.value)} aria-invalid={itemFieldErrors.options ? true : undefined} aria-describedby={itemFieldErrors.options ? "question-bank-options-error" : undefined} /><FieldError field="options" errors={itemFieldErrors} /></label>}
              <label htmlFor="question-bank-correct-answer">Đáp án đúng <small>{currentQuestionAnswerHint}</small>{itemForm.questionType === "inline" ? <textarea id="question-bank-correct-answer" ref={element => { itemFieldRefs.current.correctAnswer = element; }} rows={3} value={itemForm.correctAnswer} onChange={event => setItemField("correctAnswer", event.target.value)} placeholder={currentQuestionAnswerHint} aria-invalid={itemFieldErrors.correctAnswer ? true : undefined} aria-describedby={itemFieldErrors.correctAnswer ? "question-bank-correctAnswer-error" : undefined} /> : <input id="question-bank-correct-answer" ref={element => { itemFieldRefs.current.correctAnswer = element; }} value={itemForm.correctAnswer} onChange={event => setItemField("correctAnswer", event.target.value)} placeholder={currentQuestionAnswerHint} aria-invalid={itemFieldErrors.correctAnswer ? true : undefined} aria-describedby={itemFieldErrors.correctAnswer ? "question-bank-correctAnswer-error" : undefined} />}<FieldError field="correctAnswer" errors={itemFieldErrors} /></label>
            </div>
            <label>Giải thích / lời giải<textarea rows={3} value={itemForm.explanation} onChange={event => setItemField("explanation", event.target.value)} placeholder="Hiển thị khi chính sách cho phép." /></label>
            </fieldset>
            <details ref={advancedFieldsRef} open={advancedFieldsOpen} onToggle={event => setAdvancedFieldsOpen(event.currentTarget.open)} className="question-bank-advanced">
              <summary aria-disabled={itemSaving} onClick={event => { if (itemSaving) event.preventDefault(); }}>Thông tin bổ sung</summary>
              <div className="question-bank-form-grid">
                <label>Đoạn dẫn<textarea rows={2} value={itemForm.passage} onChange={event => setItemField("passage", event.target.value)} disabled={itemSaving} /></label>
                <label htmlFor="question-bank-media-url">URL hình ảnh <small>URL http(s) hoặc đường dẫn bắt đầu bằng /</small><input id="question-bank-media-url" type="url" ref={element => { itemFieldRefs.current.mediaUrl = element; }} value={itemForm.mediaUrl} onChange={event => setItemField("mediaUrl", event.target.value)} aria-invalid={itemFieldErrors.mediaUrl ? true : undefined} aria-describedby={itemFieldErrors.mediaUrl ? "question-bank-mediaUrl-error" : undefined} disabled={itemSaving} /><FieldError field="mediaUrl" errors={itemFieldErrors} /></label>
                <label>Hướng dẫn câu hỏi<input value={itemForm.instruction} onChange={event => setItemField("instruction", event.target.value)} disabled={itemSaving} /></label>
                <label>LaTeX lời giải<textarea rows={2} value={itemForm.solutionSource} onChange={event => setItemField("solutionSource", event.target.value)} disabled={itemSaving} /></label>
              </div>
            </details>
            {potentialDuplicates.length > 0 && <section className="question-bank-duplicate-review" aria-labelledby="question-bank-duplicate-title">
              <div className="question-bank-duplicate-heading">
                <AlertTriangle aria-hidden="true" />
                <div><h4 id="question-bank-duplicate-title">Rà soát câu hỏi gần giống</h4><p>Chưa lưu câu hỏi này. Hãy kiểm tra các mục dưới đây trước khi quyết định tạo phiên bản mới.</p></div>
              </div>
              <ol>
                {potentialDuplicates.map(candidate => <li key={candidate.id}>
                  <div><strong>{Math.round(candidate.similarity * 100)}% tương đồng</strong><span>{candidate.questionType || "Chưa xác định dạng"}</span></div>
                  <p>{candidate.prompt}</p>
                </li>)}
              </ol>
              <button type="button" ref={duplicateConfirmButtonRef} className="outline-btn small question-bank-duplicate-confirm" onClick={() => void saveItem(true)} disabled={saving}><Save aria-hidden="true" /> {itemSaving ? "Đang lưu…" : "Đã rà soát, vẫn lưu"}</button>
            </section>}
            <footer className="question-bank-editor-footer">
              <p>{editingItemId ? "Lưu thành phiên bản mới; giữ lại lịch sử câu hỏi." : "Câu hỏi được lưu vào ngân hàng đang chọn."}</p>
              <div><button type="button" className="outline-btn small" onClick={closeItemForm} disabled={saving}>Hủy</button><button className="primary-btn small" disabled={saving}><Save aria-hidden="true" /> {itemSaving ? "Đang lưu…" : editingItemId ? "Lưu phiên bản mới" : "Lưu câu hỏi"}</button></div>
            </footer>
          </form>}
          <div className="question-bank-toolbar">
            <label className="question-bank-search"><Search aria-hidden="true" /><span className="sr-only">Tìm câu hỏi</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm nội dung hoặc tag…" type="search" /></label>
            <label className="question-bank-filter"><Filter aria-hidden="true" /><span className="sr-only">Lọc độ khó</span><select value={difficulty} onChange={event => setDifficulty(event.target.value as QuestionBankDifficulty | "")}><option value="">Mọi mức độ</option>{QUESTION_BANK_DIFFICULTIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="question-bank-filter question-bank-topic-filter"><BookOpen aria-hidden="true" /><span className="question-bank-topic-label">Chủ đề</span><select value={selectedNodeId} onChange={event => setSelectedNodeId(event.target.value)} aria-label="Lọc theo chủ đề"><option value="">Tất cả câu hỏi</option>{nodeOptions.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
            <span className="question-bank-result-count" role="status">{visibleItems.length}/{items.length} câu</span>
            {(search || difficulty || selectedNodeId) && <button type="button" className="outline-btn small" onClick={() => { setSearch(""); setDifficulty(""); setSelectedNodeId(""); }}><X aria-hidden="true" /> Xóa bộ lọc</button>}
            {canManageExams && selectedItemIds.size > 0 && <button type="button" className="primary-btn small" onClick={toggleAttachForm} disabled={saving}><Link2 aria-hidden="true" /> {attachFormOpen ? "Hủy đưa vào đề" : `Đưa ${selectedItemIds.size} câu vào đề`}</button>}
            {selectionLimitNotice && <span className="question-bank-selection-limit" role="status" aria-live="polite">{selectionLimitNotice}</span>}
          </div>
          {canManageExams && hiddenSelectedItemCount > 0 && <div className="question-bank-selection-warning" role="status">
            <p>Đã chọn {selectedItemIds.size} câu; {hiddenSelectedItemCount} câu đang bị bộ lọc ẩn nhưng vẫn nằm trong lựa chọn đưa vào đề.</p>
            <button type="button" className="outline-btn small" onClick={() => {
              const visibleSelection = new Set([...selectedItemIds].filter(itemId => visibleItemIds.has(itemId)));
              setSelectedItemIds(visibleSelection);
              if (visibleSelection.size === 0) setAttachFormOpen(false);
            }} disabled={saving}>Bỏ chọn câu đang ẩn</button>
          </div>}
          {canManageExams && attachFormOpen && <form className="question-bank-attach-form" onSubmit={attachToExam}>
            <div><span className="eyebrow">REUSE IN EXAM</span><h3>Đưa câu hỏi vào đề</h3><p>Hệ thống tạo snapshot nội dung và đáp án vào section của đề nháp đã chọn; đề đã xuất bản được giữ nguyên.</p></div>
            {selectedItemIds.size === 0 && <p className="question-bank-attach-selection-empty" role="status">Không còn câu hỏi nào được chọn. Hãy chọn lại câu hỏi trong thư viện trước khi thêm vào đề.</p>}
            <label>Đề thi<select value={attachExamId} onChange={event => { setAttachExamId(event.target.value); setAttachSectionId(""); setAttachInvalidItems([]); }} required disabled={attachSaving}><option value="">Chọn đề nháp</option>{sourceExams.filter(exam => exam.published !== true).map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {exam.exam_type}</option>)}</select></label>
            <label>Phần thi<select value={attachSectionId} onChange={event => { setAttachSectionId(event.target.value); setAttachInvalidItems([]); }} required disabled={attachSaving}><option value="">Chọn section</option>{selectedSections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>
            <button className="primary-btn small" disabled={saving || selectedItemIds.size === 0 || selectedAttachInvalidItems.length > 0}><Link2 aria-hidden="true" /> {attachSaving ? "Đang thêm…" : "Thêm vào đề nháp"}</button>
            {selectedAttachInvalidItems.length > 0 && <div className="question-bank-attach-invalid" role="alert"><b>{selectedAttachInvalidItems.length} câu chưa thể đưa vào đề</b><p>Bỏ chọn hoặc sửa các câu dưới đây rồi thử lại.</p><ul>{selectedAttachInvalidItems.map(({ item, itemId, fieldErrors }) => <li key={itemId}><strong>{item?.prompt || `Câu hỏi ${itemId}`}</strong><span>{Object.values(fieldErrors).join(" ") || "Dữ liệu câu hỏi chưa hợp lệ."}</span></li>)}</ul></div>}
          </form>}
          <div className="question-bank-content">
            <section className="question-bank-items" aria-labelledby="question-bank-items-heading">
              <div className="question-bank-items-heading">
                <div><h3 id="question-bank-items-heading">Câu hỏi trong thư viện</h3><p>{canManageExams ? "Chọn câu hỏi để đưa vào đề nháp." : "Biên soạn và quản lý các phiên bản câu hỏi."}</p></div>
                <button type="button" ref={itemsRefreshButtonRef} className="outline-btn small" onClick={() => void refresh(selectedBankId)} disabled={loading || saving}><RefreshCw aria-hidden="true" /> Làm mới</button>
              </div>
              {visibleItems.length ? <div className="question-bank-item-list">{visibleItems.map((item, index) => <article className={`question-bank-item-card ${selectedItemIds.has(item.id) ? "selected" : ""}`} key={item.id}>
                <div className="question-bank-item-rail">
                  <span className="question-bank-item-number" aria-label={`Câu ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
                  {canManageExams && <label className="question-bank-item-select"><input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={() => toggleItem(item.id)} aria-label={`Chọn câu hỏi ${item.prompt.slice(0, 60)}`} disabled={saving} /><span /></label>}
                </div>
                <div className="question-bank-item-main">
                  <div className="question-bank-item-meta">
                    <span className="question-bank-item-type">{questionTypeLabel(item.question_type)}</span>
                    {item.difficulty && <span className={`difficulty-chip difficulty-${item.difficulty.toLowerCase()}`}>{item.difficulty}</span>}
                    <span className="version-chip">v{item.current_version}</span>
                    <small>{dateLabel(item.updated_at)}</small>
                    <button type="button" className="question-bank-item-preview" onClick={event => openPreview(item, event.currentTarget)} aria-haspopup="dialog" aria-label={`Xem chi tiết câu hỏi ${item.prompt.slice(0, 60)}`} disabled={saving}><Eye aria-hidden="true" /> Xem</button>
                    <button type="button" className="question-bank-item-edit" onClick={event => editItem(item, event.currentTarget)} aria-label={`Sửa câu hỏi ${item.prompt.slice(0, 60)}`} disabled={saving}><Pencil aria-hidden="true" /> Sửa</button>
                  </div>
                  <h4>{item.prompt}</h4>
                  {item.options.length > 0 && <div className="question-bank-options">{item.options.map(option => <span key={option.value}><b>{option.value}</b><span>{option.label}</span></span>)}</div>}
                  <div className="question-bank-item-footer"><span>Đáp án: <b>{answerLabel(item.correct_answer)}</b></span>{item.tags.length > 0 && <span className="question-bank-tags">{item.tags.map(tag => <em key={tag}>#{tag}</em>)}</span>}</div>
                </div>
              </article>)}</div> : <div className="question-bank-empty wide"><CheckSquare aria-hidden="true" /><h3>Chưa có câu hỏi phù hợp</h3><p>Thử đổi bộ lọc, nạp câu từ một đề hiện có hoặc thêm câu hỏi mới.</p><button type="button" className="primary-btn small" onClick={openNewItemForm} disabled={saving}><Plus aria-hidden="true" /> Thêm câu hỏi</button></div>}
            </section>
          </div>
        </> : bankLoading ? <div className="question-bank-stage-loading" aria-busy="true"><LoadingIndicator label="Đang tải nội dung ngân hàng…" /></div> : selectedBankLoadError ? <div className="question-bank-empty workspace question-bank-bank-load-error" role="alert"><AlertTriangle aria-hidden="true" /><h2>Không thể tải ngân hàng này</h2><p>{selectedBankLoadError}</p><button type="button" ref={selectedBankRetryButtonRef} className="outline-btn small" onClick={retrySelectedBank}><RefreshCw aria-hidden="true" /> Tải lại ngân hàng</button></div> : <div className="question-bank-empty workspace"><Library aria-hidden="true" /><h2>Chọn một ngân hàng để bắt đầu</h2><p>Tạo thư viện đầu tiên để biên soạn hoặc nạp câu hỏi an toàn.</p><button type="button" className="primary-btn small" onClick={openBankForm} disabled={saving}><Plus aria-hidden="true" /> Tạo ngân hàng</button></div>}
      </section>
    </div>
    {previewItem && typeof document !== "undefined" ? createPortal(
      <QuestionBankItemPreview item={previewItem} onClose={closePreview} closeButtonRef={previewCloseRef} dialogRef={previewDialogRef} />,
      document.body,
    ) : null}
  </div>;
}
