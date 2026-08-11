"use client";

import { useEffect, useRef, useState } from "react";
import { resolveHsaCombination } from "../../lib/hsa-exam";
import HsaCombinationPicker from "./HsaCombinationPicker";
import "./hsa-exam.css";

const HSA_CONFIRMATION_SECONDS = 60;

type HsaConfirmationProps = {
  examTitle: string;
  sectionTitle?: string;
  durationMinutes: number;
  starting: boolean;
  error: string;
  onStart: () => void;
  combinationCode?: string;
  onCombinationChange?: (code: string) => void;
  showCombinationPicker?: boolean;
};

export default function HsaConfirmation({
  examTitle,
  sectionTitle,
  durationMinutes,
  starting,
  error,
  onStart,
  combinationCode,
  onCombinationChange,
  showCombinationPicker = false,
}: HsaConfirmationProps) {
  const [secondsLeft, setSecondsLeft] = useState(HSA_CONFIRMATION_SECONDS);
  const [step, setStep] = useState<"pick" | "confirm">(showCombinationPicker ? "pick" : "confirm");
  const controlledCode = resolveHsaCombination(combinationCode).code;
  const [draftCode, setDraftCode] = useState(controlledCode);
  const onStartRef = useRef(onStart);

  useEffect(() => {
    onStartRef.current = onStart;
  }, [onStart]);

  const selectedCode = step === "pick" ? draftCode : controlledCode;
  const selectedCombination = resolveHsaCombination(selectedCode);
  const isPicking = showCombinationPicker && step === "pick";

  useEffect(() => {
    if (isPicking) return undefined;

    const deadline = Date.now() + HSA_CONFIRMATION_SECONDS * 1000;
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(next);
      if (next === 0) {
        window.clearInterval(timer);
        onStartRef.current();
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [isPicking]);

  const handleConfirmCode = () => {
    onCombinationChange?.(draftCode);
    setSecondsLeft(HSA_CONFIRMATION_SECONDS);
    setStep("confirm");
  };

  const handleEditCode = () => {
    setDraftCode(controlledCode);
    setStep("pick");
  };

  const displayTitle = (showCombinationPicker || combinationCode)
    ? `Phần 3: ${selectedCombination.code} – ${selectedCombination.shortLabel}`
    : (sectionTitle?.trim() || examTitle);

  return <main className="hsa-confirmation-page" aria-labelledby="hsa-confirmation-title">
    <div className="hsa-confirmation-container">
      {isPicking && (
        <div style={{ width: "100%" }}>
          <HsaCombinationPicker
            value={draftCode}
            onChange={setDraftCode}
            disabled={starting}
          />
          <button
            type="button"
            className="hsa-confirm-code-btn"
            onClick={handleConfirmCode}
            disabled={starting}
          >
            XÁC NHẬN TỔ HỢP {selectedCombination.code} ({selectedCombination.shortLabel})
          </button>
        </div>
      )}

      {!isPicking && (
        <section className="hsa-confirmation-panel">
          <div className="hsa-confirmation-logo"><img src="/logo_hsa.svg" alt="HSA" /></div>
          <h1 id="hsa-confirmation-title">{displayTitle}</h1>
          <p className="hsa-confirmation-combination-detail" style={{ color: "#0f6e2d", fontWeight: 700, margin: "-6px 0 12px", fontSize: "15px" }}>
            Tổ hợp đã chọn: {selectedCombination.code} ({selectedCombination.label})
            {showCombinationPicker && (
              <button
                type="button"
                onClick={handleEditCode}
                style={{ marginLeft: "10px", padding: "2px 8px", border: "1px solid #158a39", borderRadius: "4px", background: "#fff", color: "#158a39", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
              >
                Đổi tổ hợp
              </button>
            )}
          </p>
          <p className="hsa-confirmation-duration">Thời gian hoàn thành phần thi này: {durationMinutes} phút.</p>
          <div className="hsa-confirmation-marks" aria-label="HSA">
            <span className="hsa-confirmation-mark is-h">H</span>
            <span className="hsa-confirmation-mark is-s">S</span>
            <span className="hsa-confirmation-mark is-a">A</span>
          </div>
          <p className="hsa-confirmation-auto">Phần này tự động bắt đầu sau 60 giây.</p>
          <p className="hsa-confirmation-ready">Nếu đã sẵn sàng, bạn có thể bấm nút «BẮT ĐẦU» dưới đây để bắt đầu phần thi.</p>
          {error && <p className="hsa-confirmation-error" role="alert">{error}</p>}
          <div className="hsa-confirmation-countdown" role="timer" aria-live="polite" aria-label={`Còn ${secondsLeft} giây`}>{secondsLeft}</div>
          <button type="button" className="hsa-confirmation-start" onClick={onStart} disabled={starting} aria-busy={starting}>
            {starting ? "ĐANG BẮT ĐẦU…" : "BẮT ĐẦU"}
          </button>
        </section>
      )}
    </div>
  </main>;
}
