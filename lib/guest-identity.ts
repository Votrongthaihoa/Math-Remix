/**
 * Shared, dependency-free helpers for the identity form used by guest exam
 * links.  The same rules are used by the exam room header and by Excel
 * export, so a custom label such as “Họ và tên học sinh” still resolves to
 * the candidate's actual name instead of an arbitrary first field.
 */

export type GuestIdentityFieldLike = {
  key?: unknown;
  label?: unknown;
};

export type GuestIdentity = Record<string, unknown>;

export type GuestIdentityColumn = {
  key: string;
  label: string;
};

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function canonical(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fieldKey(field: GuestIdentityFieldLike | null | undefined) {
  return text(field?.key);
}

function fieldLabel(field: GuestIdentityFieldLike | null | undefined) {
  return text(field?.label);
}

function identityValue(identity: unknown, key: string) {
  if (!isRecord(identity)) return "";
  const value = identity[key];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

const NAME_IDENTIFIERS = new Set([
  "fullname",
  "name",
  "studentname",
  "candidatename",
  "hovaten",
  "hoten",
  "hovatenhocsinh",
  "hotenhocsinh",
  "hovatenthisinh",
  "hotenthisinh",
  "tenhocsinh",
  "tenthisinh",
  "ten",
]);

const ID_IDENTIFIERS = new Set([
  "studentcode",
  "candidatecode",
  "registrationnumber",
  "candidateid",
  "studentid",
  "sbd",
  "sobaodanh",
  "maduthi",
]);

export function isNameIdentityField(field: GuestIdentityFieldLike | null | undefined) {
  return NAME_IDENTIFIERS.has(canonical(fieldKey(field))) || NAME_IDENTIFIERS.has(canonical(fieldLabel(field)));
}

function isIdIdentityField(field: GuestIdentityFieldLike | null | undefined) {
  const key = canonical(fieldKey(field));
  const label = canonical(fieldLabel(field));
  return ID_IDENTIFIERS.has(key) || ID_IDENTIFIERS.has(label) || key.includes("studentcode") || key.includes("candidatecode");
}

function directValue(identity: unknown, identifiers: Set<string>) {
  if (!isRecord(identity)) return "";
  for (const [key, value] of Object.entries(identity)) {
    if (identifiers.has(canonical(key)) && text(value)) return text(value);
  }
  return "";
}

/** Resolve the name entered in the configured identity form. */
export function identityDisplayName(
  identity: unknown,
  fields: readonly GuestIdentityFieldLike[] = [],
  fallback = "Thí sinh",
) {
  for (const field of fields) {
    if (isNameIdentityField(field)) {
      const value = identityValue(identity, fieldKey(field));
      if (value) return value;
    }
  }
  const direct = directValue(identity, NAME_IDENTIFIERS);
  if (direct) return direct;
  if (isRecord(identity)) {
    const firstValue = Object.values(identity).find(value => text(value));
    if (firstValue) return text(firstValue);
  }
  return fallback;
}

/** Resolve a common candidate code/SBD when the form contains one. */
export function identityDisplayId(
  identity: unknown,
  fields: readonly GuestIdentityFieldLike[] = [],
) {
  for (const field of fields) {
    if (isIdIdentityField(field)) {
      const value = identityValue(identity, fieldKey(field));
      if (value) return value;
    }
  }
  return directValue(identity, ID_IDENTIFIERS);
}

function humanizeKey(key: string) {
  const value = key.replace(/[_-]+/g, " ").trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Thông tin";
}

/**
 * Build a stable union of the current form, the form snapshot at attempt
 * start, and keys found in historical attempts. This keeps old input visible
 * even after an administrator renames or removes a field.
 */
export function buildGuestIdentityColumns(
  fields: readonly GuestIdentityFieldLike[] = [],
  snapshots: readonly unknown[] = [],
  identities: readonly unknown[] = [],
) {
  const columns: GuestIdentityColumn[] = [];
  const seen = new Set<string>();
  const add = (keyValue: unknown, labelValue: unknown) => {
    const key = text(keyValue);
    if (!key || seen.has(key)) return;
    seen.add(key);
    columns.push({ key, label: text(labelValue) || humanizeKey(key) });
  };

  for (const field of fields) add(fieldKey(field), fieldLabel(field));
  for (const snapshot of snapshots) {
    if (!isRecord(snapshot) || !Array.isArray(snapshot.identityFields)) continue;
    for (const field of snapshot.identityFields) {
      if (isRecord(field)) add(field.key, field.label);
    }
  }
  for (const identity of identities) {
    if (!isRecord(identity)) continue;
    for (const key of Object.keys(identity)) add(key, "");
  }
  return columns;
}

export function guestIdentityValue(identity: unknown, key: string) {
  return identityValue(identity, key);
}
