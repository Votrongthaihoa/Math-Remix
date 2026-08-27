export function upsertCollectionRecord<T extends { id: string | number }>(
  records: T[],
  nextRecord: T,
) {
  const index = records.findIndex((record) => String(record.id) === String(nextRecord.id));
  if (index < 0) return [...records, nextRecord];
  return records.map((record, recordIndex) => recordIndex === index ? nextRecord : record);
}
