import {
  AdminDashboardSchema,
  StudentDashboardSchema,
} from "@aeck/contracts";
import { queryOptions } from "@tanstack/react-query";

import { requestApi } from "./api-client.ts";

export const studentDashboardQuery = queryOptions({
  queryKey: ["dashboard", "student"],
  queryFn: () => requestApi("/api/dashboard/student", StudentDashboardSchema),
  staleTime: 60_000,
});

export const adminDashboardQuery = queryOptions({
  queryKey: ["dashboard", "admin"],
  queryFn: () => requestApi("/api/dashboard/admin", AdminDashboardSchema),
  staleTime: 30_000,
});
