import {
  IntegrationStatusListSchema,
  OcrResultSchema,
  ShipmentTrackingRequestSchema,
  ShipmentTrackingResultSchema,
  VietQrLookupRequestSchema,
  VietQrLookupResultSchema,
  ZoomMeetingRequestSchema,
  ZoomMeetingResultSchema,
  type ShipmentTrackingRequest,
  type VietQrLookupRequest,
  type ZoomMeetingRequest,
} from "@aeck/contracts";
import { queryOptions } from "@tanstack/react-query";

import { requestApi } from "./api-client.ts";

export function getIntegrationStatus(fetcher?: typeof fetch) {
  return requestApi(
    "/api/platform/v1/integrations/status",
    IntegrationStatusListSchema,
    { fetcher },
  );
}

export const integrationStatusQuery = queryOptions({
  queryKey: ["platform", "integrations", "status"],
  queryFn: () => getIntegrationStatus(),
  staleTime: 30_000,
});

export function createZoomMeeting(input: ZoomMeetingRequest) {
  const request = ZoomMeetingRequestSchema.parse(input);
  return requestApi(
    "/api/platform/v1/integrations/zoom/meetings",
    ZoomMeetingResultSchema,
    { method: "POST", body: JSON.stringify(request) },
  );
}

export function lookupVietQrAccount(input: VietQrLookupRequest) {
  const request = VietQrLookupRequestSchema.parse(input);
  return requestApi(
    "/api/platform/v1/integrations/vietqr/lookup",
    VietQrLookupResultSchema,
    { method: "POST", body: JSON.stringify(request) },
  );
}

export function trackShipment(input: ShipmentTrackingRequest) {
  const request = ShipmentTrackingRequestSchema.parse(input);
  return requestApi(
    "/api/platform/v1/integrations/shipments/track",
    ShipmentTrackingResultSchema,
    { method: "POST", body: JSON.stringify(request) },
  );
}

export function recognizeEquation(file: File) {
  const body = new FormData();
  body.set("file", file);
  return requestApi(
    "/api/platform/v1/integrations/gemini-ocr/equation",
    OcrResultSchema,
    { method: "POST", body },
  );
}
