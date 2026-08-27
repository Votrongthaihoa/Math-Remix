import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router-dom";

import { router } from "./router.tsx";
import { SessionBootstrap } from "../features/auth/session-bootstrap.tsx";

export function AppProviders() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              if (
                typeof error === "object" &&
                error !== null &&
                "status" in error &&
                typeof error.status === "number" &&
                error.status < 500
              ) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionBootstrap>
        <RouterProvider router={router} />
      </SessionBootstrap>
    </QueryClientProvider>
  );
}
