"use client";

import { getHsaCombination, HSA_COMBINATIONS, resolveHsaCombination } from "../../lib/hsa-exam";
import "./hsa-exam.css";

type HsaCombinationPickerProps = {
  value?: string;
  onChange: (code: string) => void;
  disabled?: boolean;
};

export function HsaCombinationSummary({ code, className = "" }: { code?: string; className?: string }) {
  const combination = resolveHsaCombination(code);
  return <div className={`hsa-combination-summary ${className}`.trim()} data-testid="hsa-combination-summary">
    <span className="hsa-combination-summary-code">{combination.code}</span>
    <span className="hsa-combination-summary-copy">
      <b>{combination.shortLabel}</b>
      <small>{combination.mode === "english" ? "Mã Tiếng Anh HSA-F" : "Tổ hợp Khoa học"}</small>
    </span>
  </div>;
}

export default function HsaCombinationPicker({ value, onChange, disabled = false }: HsaCombinationPickerProps) {
  const selectedCode = getHsaCombination(value)?.code ?? HSA_COMBINATIONS[0].code;
  return <section className="hsa-combination-picker" data-testid="hsa-combination-picker" aria-labelledby="hsa-combination-title">
    <header className="hsa-combination-picker-header">
      <div>
        <span className="hsa-combination-eyebrow">PHẦN 3 · CHỌN TỔ HỢP</span>
        <h2 id="hsa-combination-title">Chọn cụm môn để thi</h2>
        <p>Chọn đúng mã tổ hợp trước khi bắt đầu. Hệ thống sẽ nạp và chấm các câu thuộc lựa chọn này.</p>
      </div>
      <HsaCombinationSummary code={selectedCode} />
    </header>
    <fieldset className="hsa-combination-options" disabled={disabled}>
      <legend className="hsa-visually-hidden">Mã tổ hợp HSA Phần 3</legend>
      {HSA_COMBINATIONS.map(combination => {
        const selected = combination.code === selectedCode;
        return <label key={combination.code} className={`hsa-combination-option${selected ? " is-selected" : ""}`}>
          <input
            type="radio"
            name="hsa-combination"
            value={combination.code}
            checked={selected}
            onChange={() => onChange(combination.code)}
          />
          <span className="hsa-combination-option-code">{combination.code}</span>
          <span className="hsa-combination-option-copy">
            <b>{combination.shortLabel}</b>
            <small>{combination.label}</small>
          </span>
          <span className="hsa-combination-option-mark" aria-hidden="true">✓</span>
        </label>;
      })}
    </fieldset>
  </section>;
}
