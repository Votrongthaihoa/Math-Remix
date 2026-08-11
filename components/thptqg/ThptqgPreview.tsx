"use client";

import { useMemo, useState } from "react";
import type { ParsedLatexQuestion } from "../../lib/exam-latex";
import ThptqgExamRenderer, { type ThptqgAnswerValue, type ThptqgQuestion } from "./ThptqgExamRenderer";
import ThptqgSubjectDashboard, { type ThptqgExam, type ThptqgRoom, type ThptqgSection } from "./ThptqgSubjectDashboard";
import "./thptqg.css";
import "./thptqg-preview.css";

export type ThptqgPreviewQuestion = {
  parsed: ParsedLatexQuestion;
  passage?: string;
  instruction?: string;
  mediaUrl?: string;
};

export type ThptqgPreviewSection = {
  id: string;
  title: string;
  subjectCode?: string | null;
  durationMinutes: number;
  questions: ThptqgPreviewQuestion[];
};

function runtimeQuestion(sectionId: string, item: ThptqgPreviewQuestion, index: number): ThptqgQuestion {
  return {
    id: `preview-${sectionId}-${index + 1}`,
    prompt: item.parsed.prompt,
    question_type: item.parsed.questionType,
    option_columns: item.parsed.optionColumns,
    options: item.parsed.options.map((option, optionIndex) => ({
      value: option.value || String.fromCharCode(65 + optionIndex),
      label: option.label || option.value || `Phương án ${optionIndex + 1}`,
    })),
      passage: item.passage || null,
      media_url: item.mediaUrl || null,
      instruction: item.instruction || null,
      part: item.parsed.part,
      solution: item.parsed.solution || null,
    };
}

export default function ThptqgPreview({
  examTitle,
  roomTitle,
  roomDescription,
  dashboardTitle,
  sections,
  candidateName,
  candidateId,
  mode,
  onModeChange,
  onClose,
}: {
  examTitle: string;
  roomTitle: string;
  roomDescription?: string;
  dashboardTitle?: string | null;
  sections: ThptqgPreviewSection[];
  candidateName: string;
  candidateId: string;
  mode: "exam" | "answer";
  onModeChange: (mode: "exam" | "answer") => void;
  onClose: () => void;
}) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const activeSection = sections.find(section => section.id === activeSectionId) ?? null;
  const activeQuestions = useMemo(
    () => activeSection ? activeSection.questions.map((item, index) => runtimeQuestion(activeSection.id, item, index)) : [],
    [activeSection],
  );
  const answerPreview = useMemo<Record<string, ThptqgAnswerValue>>(() => {
    if (mode !== "answer" || !activeSection) return {};
    return Object.fromEntries(activeSection.questions.map((item, index) => [
      `preview-${activeSection.id}-${index + 1}`,
      item.parsed.correctAnswer,
    ]));
  }, [activeSection, mode]);
  const room: ThptqgRoom = {
    id: "preview-room",
    title: roomTitle,
    description: roomDescription || "",
    exam_type: "THPTQG",
  };
  const exam: ThptqgExam = {
    id: "preview-exam",
    title: examTitle,
    description: roomDescription || "",
    dashboard_title: dashboardTitle,
    duration_minutes: activeSection?.durationMinutes ?? 50,
    mode: "preview",
  };
  const dashboardSections: ThptqgSection[] = sections.map(section => ({
    id: section.id,
    exam_id: exam.id,
    title: section.title,
    subject_code: section.subjectCode,
    duration_minutes: section.durationMinutes,
    sort_order: sections.findIndex(item => item.id === section.id),
  }));

  return <main className="thptqg-preview-page">
    <div className="thptqg-preview-canvas">
      {!activeSection ? <ThptqgSubjectDashboard
        room={room}
        exam={exam}
        sections={dashboardSections}
        attempts={[]}
        candidateName={candidateName}
        candidateId={candidateId}
        dashboardTitle={dashboardTitle}
        mode="exam"
        onChoose={section => setActiveSectionId(section.id)}
        onContinue={section => setActiveSectionId(section.id)}
        onResult={() => undefined}
        onExit={onClose}
      /> : <ThptqgExamRenderer
        key={`${activeSection.id}-${mode}`}
        examTitle={examTitle}
        subjectTitle={activeSection.title}
        candidateName={candidateName}
        candidateId={candidateId}
        mode="exam"
        questions={activeQuestions}
        initialAnswers={answerPreview}
        initialRemainingSeconds={Math.max(1, activeSection.durationMinutes) * 60}
         preview
         previewMode={mode}
         onPreviewModeChange={onModeChange}
         onExit={() => setActiveSectionId(null)}
        onSubmit={() => undefined}
      />}
    </div>
  </main>;
}
