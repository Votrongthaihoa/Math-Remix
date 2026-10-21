import { Check, FileText, ImageOff, Lightbulb, X } from "lucide-react";
import { questionTypeLabel } from "../lib/exam-config";
import type { QuestionBankItem } from "../lib/question-bank";
import "./question-bank-item-preview.css";

type QuestionBankItemPreviewProps = {
  item: QuestionBankItem;
  onClose: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  dialogRef: React.RefObject<HTMLElement | null>;
};

function answerValues(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map(value => value.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function promptParts(prompt: string) {
  return prompt.split(/_{3,}/g);
}

function PreviewPrompt({ item }: { item: QuestionBankItem }) {
  if (item.question_type !== "inline" && item.question_type !== "drag_drop") {
    return <p className="question-bank-preview-prompt">{item.prompt}</p>;
  }

  const parts = promptParts(item.prompt);
  return (
    <p className="question-bank-preview-prompt">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 && <span className="question-bank-preview-blank" aria-label={`Ô trống ${index + 1}`}>{index + 1}</span>}
        </span>
      ))}
    </p>
  );
}

function PreviewAnswer({ item, answers }: { item: QuestionBankItem; answers: string[] }) {
  if (item.question_type === "text") {
    return <div className="question-bank-preview-answer"><b>Đáp án ngắn</b><span>{answers[0] || "Chưa có đáp án"}</span></div>;
  }

  if (item.question_type === "inline" || item.question_type === "drag_drop") {
    return (
      <div className="question-bank-preview-answer">
        <b>{item.question_type === "drag_drop" ? "Thứ tự thả vào ô" : "Đáp án theo từng ô trống"}</b>
        {answers.length ? <ol>{answers.map((answer, index) => <li key={`${answer}-${index}`}><span>Ô {index + 1}</span><strong>{answer}</strong></li>)}</ol> : <span>Chưa có đáp án</span>}
      </div>
    );
  }

  return <div className="question-bank-preview-answer"><b>Đáp án đúng</b><span>{answers.length ? answers.join(", ") : "Chưa có đáp án"}</span></div>;
}

export default function QuestionBankItemPreview({ item, onClose, closeButtonRef, dialogRef }: QuestionBankItemPreviewProps) {
  const answers = answerValues(item.correct_answer);
  const answerSet = new Set(answers.map(answer => answer.toLocaleLowerCase("vi")));
  const isOptionAnswer = item.question_type !== "text" && item.question_type !== "inline";

  return (
    <div className="question-bank-preview-modal" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <button type="button" className="question-bank-preview-backdrop" aria-label="Đóng xem trước" onClick={onClose} />
      <section ref={dialogRef} className="question-bank-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="question-bank-preview-title" tabIndex={-1}>
        <header className="question-bank-preview-header">
          <div>
            <span className="question-bank-preview-kicker">XEM TRƯỚC CÂU HỎI</span>
            <h2 id="question-bank-preview-title">{questionTypeLabel(item.question_type)}</h2>
            <p>Phiên bản {item.current_version}{item.difficulty ? ` · ${item.difficulty}` : ""}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="question-bank-preview-close" onClick={onClose} aria-label="Đóng xem trước">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="question-bank-preview-scroll">
          {item.passage && <aside className="question-bank-preview-passage"><FileText aria-hidden="true" /><p>{item.passage}</p></aside>}
          {item.instruction && <p className="question-bank-preview-instruction">{item.instruction}</p>}
          <article className="question-bank-preview-question">
            <PreviewPrompt item={item} />
            {item.media_url && <figure className="question-bank-preview-media"><img src={item.media_url} alt="Hình minh họa cho câu hỏi" loading="lazy" decoding="async" /><figcaption><ImageOff aria-hidden="true" /> Ảnh minh họa từ URL của câu hỏi</figcaption></figure>}
            {item.options.length > 0 && isOptionAnswer && <div className="question-bank-preview-options" aria-label="Các phương án">
              {item.options.map(option => {
                const correct = answerSet.has(option.value.toLocaleLowerCase("vi"));
                return <div className={`question-bank-preview-option ${correct ? "is-correct" : ""}`} key={option.value}>
                  <span className="question-bank-preview-option-key">{option.value}</span>
                  <span>{option.label}</span>
                  {correct && <Check aria-label="Đáp án đúng" />}
                </div>;
              })}
            </div>}
            <PreviewAnswer item={item} answers={answers} />
            {(item.explanation || item.solution_source) && <details className="question-bank-preview-solution">
              <summary><Lightbulb aria-hidden="true" /> Mở lời giải</summary>
              {item.explanation && <p>{item.explanation}</p>}
              {item.solution_source && <pre>{item.solution_source}</pre>}
            </details>}
          </article>
          <footer className="question-bank-preview-footer">
            <span>Chỉ đọc · thay đổi nội dung dùng nút Sửa trong thư viện.</span>
            {item.tags.length > 0 && <span className="question-bank-preview-tags">{item.tags.map(tag => <em key={tag}>#{tag}</em>)}</span>}
          </footer>
        </div>
      </section>
    </div>
  );
}
