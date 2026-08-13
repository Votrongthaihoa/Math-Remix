import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildHsaQuestionGroups } from "../../lib/hsa-exam";
import { GroupPassage, QuestionAnswer, RichQuestionContent, isAnswered } from "./MathExam.jsx";
import "./hsa-exam.css";

const EMPTY_LIST = [];
const EMPTY_NAVIGATION_POLICY = {};

function formatClock(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function answerLabel(question, value) {
  if (value === undefined || value === null || value === "") return "-";
  if (question.type === "single_choice") return Number.isInteger(value) ? String.fromCharCode(65 + value) : "-";
  if (question.type === "multiple_choice") {
    return Array.isArray(value) && value.length
      ? value.map((item) => Number.isInteger(item) ? String.fromCharCode(65 + item) : "?").join(",")
      : "-";
  }
  if (question.type === "fill_in_blank") {
    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => String(item ?? "").trim()).filter(Boolean).join(", ") || "-";
  }
  if (question.type === "true_false") {
    return Array.isArray(value) && value.length
      ? value.map((item) => item === true ? "Đ" : item === false ? "S" : "-").join(" ")
      : "-";
  }
  if (Array.isArray(value) && value.length) return value.map(String).join(", ");
  return String(value);
}

function HsaSubmitDialog({ answered, total, timedOut, submitting, error, onContinue, onSubmit }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !timedOut && !submitting) {
        event.preventDefault();
        onContinue();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onContinue, submitting, timedOut]);

  return <div className="hsa-submit-backdrop" role="presentation">
    <section ref={dialogRef} className="hsa-submit-dialog" role="dialog" aria-modal="true" aria-labelledby="hsa-submit-title" tabIndex={-1}>
      {!timedOut && <button type="button" className="hsa-submit-close" aria-label="Đóng xác nhận nộp bài" onClick={onContinue} disabled={submitting}>×</button>}
      <div className="hsa-submit-count"><strong>{answered}/{total}</strong><span>câu</span></div>
      <p id="hsa-submit-title">{timedOut ? `Thời gian làm bài đã kết thúc. Hệ thống sẽ nộp ${answered}/${total} câu bạn đã trả lời.` : `Đã trả lời ${answered}/${total} câu. Bạn vẫn còn thời gian làm bài, bạn có chắc chắn muốn kết thúc bài thi.`}</p>
      {error && <div className="hsa-submit-error" role="alert">{error}</div>}
      <div className="hsa-submit-actions">
        {!timedOut && <button type="button" onClick={onContinue} disabled={submitting}>Làm bài tiếp</button>}
        <button type="button" className="primary" onClick={onSubmit} disabled={submitting} aria-busy={submitting}>{submitting ? "Đang nộp…" : "Nộp bài thi"}</button>
      </div>
    </section>
  </div>;
}

function reviewStatusFor(question, index, answers, reviewStatuses) {
  const status = reviewStatuses[index];
  return status === "correct" || status === "incorrect" || status === "unanswered"
    ? status
    : isAnswered(question, answers[question.id]) ? "correct" : "unanswered";
}

const HsaQuestionNav = React.memo(function HsaQuestionNav({ questions, answers, currentIndex, onSelect, answerPreview = false, reviewStatuses = [] }) {
  return <nav className="hsa-question-nav" aria-label="Điều hướng câu hỏi">
    <div className="hsa-question-nav-scroll">
      {questions.map((question, index) => {
        const status = reviewStatusFor(question, index, answers, reviewStatuses);
        const answered = status !== "unanswered";
        return <button
          type="button"
          key={question.id}
          className={`${index === currentIndex ? "current" : ""} ${answered ? "answered" : ""}${answerPreview ? ` status-${status}` : ""}`}
          aria-current={index === currentIndex ? "step" : undefined}
          aria-label={`Câu ${index + 1}${answered ? ", đã trả lời" : ", chưa trả lời"}`}
          onClick={() => onSelect(index)}
        >{index + 1}</button>;
      })}
    </div>
  </nav>;
});

function HsaReviewWatermark({ candidateId }) {
  if (!candidateId) return null;
  return <div className="hsa-review-watermarks" aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <span key={index}>{candidateId}</span>)}</div>;
}

const HsaQuestionCard = React.memo(function HsaQuestionCard({
  question,
  index,
  isCurrent,
  complete,
  readOnly,
  answerPreview,
  value,
  solution,
  solutionOpen,
  onRef,
  onAnswerChange,
  onToggleSolution,
}) {
  return (
    <article
      ref={onRef}
      data-question-index={index}
      className={`hsa-question${isCurrent ? " current" : ""}${complete ? " answered" : ""}${question._loading ? " loading" : ""}`}
    >
      <div className="hsa-question-heading">
        <span>{`Câu ${index + 1}.`}</span>
        {question.instruction && <small>{question.instruction}</small>}
      </div>
      {question._loading ? (
        <div className="hsa-question-skeleton" aria-busy={!question._loadError}>
          <i /><i /><i />
          {question._loadError && <span role="alert">{question._loadError}</span>}
        </div>
      ) : (
        <div className="hsa-question-body">
          <QuestionAnswer
            question={question}
            value={value}
            onChange={onAnswerChange}
            mathDisplayStyle
            readOnly={readOnly}
            hideEmptyReadOnlyBlanks={answerPreview}
          />
        </div>
      )}
      {answerPreview && solution && <div className="hsa-review-solution">
        <button type="button" aria-expanded={solutionOpen} onClick={onToggleSolution}>
          <span>Lời giải</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d={solutionOpen ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} /></svg>
        </button>
        {solutionOpen && <div className="hsa-review-solution-content"><h4><i aria-hidden="true">?</i>Lời giải chi tiết:</h4><RichQuestionContent content={solution} mathDisplayStyle /></div>}
      </div>}
    </article>
  );
});

export default function HsaExamRenderer({
  onSubmit,
  onProgress,
  onQuestionRequest,
  part,
  partData,
  initialState = null,
  freezeTimer = false,
  readOnly = false,
  examTitle = "",
  sectionTitle = "",
  candidateName = "Thí sinh",
  candidateId = "",
  logoSrc = "/logo_hsa.svg",
  headerExtras = null,
  previewMode = false,
  answerPreview = false,
  reviewStatuses = EMPTY_LIST,
  solutions = EMPTY_LIST,
  navigationPolicy = EMPTY_NAVIGATION_POLICY,
}) {
  const questions = partData?.questions ?? EMPTY_LIST;
  const groups = useMemo(() => buildHsaQuestionGroups(questions), [questions]);
  const initialAnswerSignature = JSON.stringify(initialState?.answers || {});
  const synchronizedAnswers = useMemo(() => JSON.parse(initialAnswerSignature), [initialAnswerSignature]);
  const [currentIndex, setCurrentIndex] = useState(Math.min(Math.max(0, initialState?.currentIndex || 0), Math.max(0, questions.length - 1)));
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const [answerChanges, setAnswerChanges] = useState({});
  const answers = useMemo(() => ({ ...synchronizedAnswers, ...answerChanges }), [answerChanges, synchronizedAnswers]);
  const [visited, setVisited] = useState(initialState?.visited || []);
  const [marked] = useState(initialState?.marked || []);
  const startingRemaining = Math.max(0, initialState?.remainingSeconds ?? (partData?.time ?? 60) * 60);
  const [remaining, setRemaining] = useState(startingRemaining);
  const remainingRef = useRef(remaining);
  useEffect(() => { remainingRef.current = remaining; }, [remaining]);
  const [showSubmit, setShowSubmit] = useState(() => !readOnly && startingRemaining === 0 ? "timeout" : null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [expandedSolutions, setExpandedSolutions] = useState(() => new Set());
  const questionRefs = useRef(new Map());
  const scrollRootRef = useRef(null);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const setAnswers = useCallback((update) => setAnswerChanges((previous) => {
    const current = { ...synchronizedAnswers, ...previous };
    return typeof update === "function" ? update(current) : update;
  }), [synchronizedAnswers]);

  const canPreviewSubmit = !readOnly || previewMode;
  const answered = useMemo(() => questions.filter((question) => isAnswered(question, answers[question.id])).length, [answers, questions]);
  const canNavigate = useCallback((index) => {
    if (index < 0 || index >= questions.length || index === currentIndex) return false;
    if (index < currentIndex && navigationPolicy.allowBacktrack === false) return false;
    if (index > currentIndex && navigationPolicy.allowSkip === false) return false;
    return true;
  }, [currentIndex, navigationPolicy.allowBacktrack, navigationPolicy.allowSkip, questions.length]);

  const scrollToQuestion = useCallback((index, behavior = "smooth") => {
    const element = questionRefs.current.get(index);
    if (!element) return;
    element.scrollIntoView({ behavior, block: "start" });
  }, []);

  const goTo = useCallback((index, behavior = "smooth") => {
    if (!canNavigate(index) && index !== currentIndex) return;
    setCurrentIndex(index);
    scrollToQuestion(index, behavior);
  }, [canNavigate, currentIndex, scrollToQuestion]);

  useEffect(() => {
    if (readOnly) return undefined;
    questions.forEach((question, index) => {
      if (question._loading) onQuestionRequest?.(index);
    });
    return undefined;
  }, [onQuestionRequest, questions, readOnly]);

  useEffect(() => {
    if (freezeTimer || startingRemaining === 0) return undefined;
    const deadline = Date.now() + startingRemaining * 1000;
    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && !readOnly) setShowSubmit("timeout");
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [freezeTimer, readOnly, startingRemaining]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return undefined;
    let rafId = null;
    const observer = new IntersectionObserver((entries) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        const index = visible?.target?.dataset?.questionIndex;
        if (index == null) return;
        const nextIndex = Number(index);
        if (nextIndex !== currentIndexRef.current) {
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
        }
        const question = questions[nextIndex];
        if (question && !question._loading) {
          setVisited((items) => (items.includes(question.id) ? items : [...items, question.id]));
        }
      });
    }, { root, threshold: [0.35, 0.6, 0.9] });

    questionRefs.current.forEach((element) => observer.observe(element));
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [groups, questions]);

  useEffect(() => {
    const remainingSeconds = remainingRef.current;
    onProgressRef.current?.({ partId: part?.id, answers, marked, visited, currentIndex, remainingSeconds, elapsedSeconds: Math.max(0, (partData?.time ?? 60) * 60 - remainingSeconds) });
  }, [answers, currentIndex, marked, part?.id, partData?.time, visited]);

  const submitPart = async () => {
    if (submitting || !canPreviewSubmit) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await onSubmit?.({
        partId: part?.id,
        answers,
        marked,
        visited,
        currentIndex,
        remainingSeconds: remaining,
        answered,
        total: questions.length,
        elapsedSeconds: Math.max(0, (partData?.time ?? 60) * 60 - remaining),
        timedOut: showSubmit === "timeout",
        submittedAt: new Date().toISOString(),
      });
      setShowSubmit(null);
    } catch (value) {
      setSubmitError(value instanceof Error ? value.message : "Không thể nộp bài thi.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSolution = useCallback((index) => setExpandedSolutions((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return next;
  }), []);

  const handleAnswerChange = useCallback((id, next) => {
    setAnswers((previous) => ({ ...previous, [id]: next }));
  }, [setAnswers]);

  return <div className={`hsa-exam-page${previewMode ? " hsa-preview-mode" : ""}${answerPreview ? " hsa-answer-preview" : ""}`} data-testid="hsa-exam-page">
    {answerPreview && <HsaReviewWatermark candidateId={candidateId} />}
    <header className="hsa-exam-header">
      <div className="hsa-exam-brand">
        <img src={logoSrc} alt="HSA" />
        {headerExtras}
      </div>
      <div className="hsa-exam-title"><strong>{examTitle || "Bài thi HSA"}</strong><span>{sectionTitle || part?.label || ""}</span></div>
      <div className="hsa-exam-candidate"><span>{candidateName}</span>{candidateId && <small>{candidateId}</small>}</div>
      <div className="hsa-exam-timer" aria-label="Thời gian còn lại"><span>Thời gian còn lại</span><strong>{formatClock(remaining)}</strong></div>
    </header>

    <HsaQuestionNav questions={questions} answers={answers} currentIndex={currentIndex} onSelect={(index) => goTo(index)} answerPreview={answerPreview} reviewStatuses={reviewStatuses} />

    <main ref={scrollRootRef} className="hsa-question-scroll" aria-label={`Câu hỏi ${sectionTitle || "HSA"}`}>
      <div className="hsa-question-content">
        {groups.map((group) => {
          const firstIndex = questions.findIndex((question) => question.id === group.questions[0]?.id);
          const lastIndex = firstIndex + group.questions.length - 1;
          return <section className={`hsa-question-group${group.content ? " has-passage" : ""}`} key={group.id}>
            {group.content && <GroupPassage content={group.content} start={firstIndex + 1} end={lastIndex + 1} className="hsa-passage" />}
            <div className="hsa-question-list">
              {group.questions.map((question) => {
                const index = questions.findIndex((item) => item.id === question.id);
                const value = answers[question.id];
                const complete = isAnswered(question, value);
                const solution = String(solutions[index] || "").trim();
                const solutionOpen = expandedSolutions.has(index);
                return <HsaQuestionCard
                  key={question.id}
                  question={question}
                  index={index}
                  isCurrent={index === currentIndex}
                  complete={complete}
                  readOnly={readOnly}
                  answerPreview={answerPreview}
                  value={value}
                  solution={solution}
                  solutionOpen={solutionOpen}
                  onRef={(element) => { if (element) questionRefs.current.set(index, element); else questionRefs.current.delete(index); }}
                  onAnswerChange={(next) => handleAnswerChange(question.id, next)}
                  onToggleSolution={() => toggleSolution(index)}
                />;
              })}
            </div>
          </section>;
        })}
        {!groups.length && <div className="hsa-empty-state"><strong>Phần thi chưa có câu hỏi</strong><span>Nội dung sẽ hiển thị sau khi đề được xuất bản.</span></div>}
        {!answerPreview && groups.length > 0 && <footer className="hsa-question-footer"><button type="button" onClick={() => { if (canPreviewSubmit) setShowSubmit("manual"); }} aria-disabled={!canPreviewSubmit || undefined}>KẾT THÚC</button></footer>}
      </div>
    </main>

    <aside className="hsa-answer-panel" aria-label="Trả lời của bạn" data-testid="hsa-answer-panel">
      <h2>Trả lời<br />của bạn</h2>
      <div className="hsa-answer-grid">
        {questions.map((question, index) => {
          const value = answers[question.id];
          const complete = isAnswered(question, value);
          const label = answerLabel(question, value);
          const status = answerPreview ? reviewStatusFor(question, index, answers, reviewStatuses) : "";
          return <button type="button" key={question.id} className={`${index === currentIndex ? "current" : ""}${complete ? " answered" : ""}${status ? ` status-${status}` : ""}`} aria-label={`Câu ${index + 1}: ${label === "-" ? "chưa trả lời" : label}`} onClick={() => goTo(index)}>
            <span>{index + 1}.</span><b title={label}>{label}</b>
          </button>;
        })}
      </div>
    </aside>

    {showSubmit && <HsaSubmitDialog answered={answered} total={questions.length} timedOut={showSubmit === "timeout"} submitting={submitting} error={submitError} onContinue={() => { if (!submitting) setShowSubmit(null); }} onSubmit={submitPart} />}
  </div>;
}
