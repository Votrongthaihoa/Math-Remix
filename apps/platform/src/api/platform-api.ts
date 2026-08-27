import {
  CourseDetailSchema,
  PlatformCollectionSchema,
  PlatformResourceSchema,
  TimetableEntrySchema,
  type PlatformResource,
} from "@aeck/contracts";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { requestApi } from "./api-client.ts";

export function platformCollectionQuery(resource: PlatformResource) {
  const parsedResource = PlatformResourceSchema.parse(resource);
  return queryOptions({
    queryKey: ["platform", "collection", parsedResource],
    queryFn: () =>
      requestApi(
        `/api/platform/v1/collections/${parsedResource}`,
        PlatformCollectionSchema,
      ),
    staleTime: 45_000,
  });
}

export function courseDetailQuery(courseId: string) {
  return queryOptions({
    queryKey: ["platform", "course", courseId],
    queryFn: () =>
      requestApi(
        `/api/platform/v1/courses/${encodeURIComponent(courseId)}`,
        CourseDetailSchema,
      ),
    staleTime: 60_000,
  });
}

export const timetableQuery = queryOptions({
  queryKey: ["platform", "timetable"],
  queryFn: () =>
    requestApi(
      "/api/platform/v1/timetable",
      z.array(TimetableEntrySchema),
    ),
  staleTime: 30_000,
});
