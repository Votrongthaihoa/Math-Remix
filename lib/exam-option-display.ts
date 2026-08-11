export type ExamDisplayOption = string | {
  id?: string;
  value?: string;
  label?: string;
  text?: string;
};

/**
 * Keep the answer identity separate from its visible, positional label.
 *
 * A shuffled option can keep the original value "C" for scoring while being
 * rendered in the first slot as "A". Legacy string options can supply the
 * stable value saved in the attempt's option_order snapshot.
 */
export function positionalOptionParts(option: ExamDisplayOption, index: number, stableValue?: string) {
  const displayLabel = String.fromCharCode(65 + index);
  const snapshotValue = typeof stableValue === "string" && stableValue.length ? stableValue : undefined;
  if (typeof option === "string") {
    return {
      value: snapshotValue ?? displayLabel,
      displayLabel,
      label: option,
    };
  }
  return {
    value: snapshotValue ?? option.value ?? option.id ?? displayLabel,
    displayLabel,
    label: option.label ?? option.text ?? option.value ?? `Phương án ${index + 1}`,
  };
}
