import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AECK UI boundary", {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="aeck-fatal-error">
        <img src="/aeck-mark.svg" alt="" width="54" height="58" />
        <h1>Ứng dụng gặp sự cố</h1>
        <p>Nội dung của bạn vẫn an toàn. Hãy tải lại trang để tiếp tục.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Tải lại trang
        </button>
      </main>
    );
  }
}
