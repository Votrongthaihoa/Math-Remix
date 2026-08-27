import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

export default function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="aeck-route-error">
      <img src="/aeck-wordmark.svg" alt="AECK" width="148" height="34" />
      <p>{notFound ? "404" : "Có lỗi xảy ra"}</p>
      <h1>{notFound ? "Không tìm thấy trang" : "Không thể mở nội dung này"}</h1>
      <Link to="/">Trở về trang chính</Link>
    </main>
  );
}
