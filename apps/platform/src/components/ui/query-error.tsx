export function QueryError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="aeck-query-error" role="alert">
      <div>
        <strong>Không thể tải dữ liệu</strong>
        <p>{message}</p>
      </div>
      <button type="button" onClick={retry}>
        Thử lại
      </button>
    </div>
  );
}
