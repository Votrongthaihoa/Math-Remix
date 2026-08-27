import {
  ApiErrorSchema,
  type ApiErrorCode,
} from "@aeck/contracts";
import { z } from "zod";

import { authStore } from "../store/auth-store.ts";

const ApiEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: ApiErrorSchema }),
]);

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly recoverable: boolean;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: ApiErrorCode;
      recoverable: boolean;
      status: number;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiClientError";
    this.code = options.code;
    this.recoverable = options.recoverable;
    this.status = options.status;
    this.details = options.details;
  }
}

export async function parseApiResponse<TSchema extends z.ZodType>(
  response: Response,
  dataSchema: TSchema,
): Promise<z.infer<TSchema>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiClientError("Máy chủ trả về dữ liệu không hợp lệ.", {
      code: "INTERNAL_ERROR",
      recoverable: true,
      status: response.status,
      cause,
    });
  }

  const envelope = ApiEnvelopeSchema.safeParse(payload);
  if (!envelope.success) {
    const legacyError = ApiErrorSchema.safeParse(
      typeof payload === "object" && payload !== null && "error" in payload
        ? payload.error
        : undefined,
    );
    if (legacyError.success) {
      throw new ApiClientError(legacyError.data.message, {
        ...legacyError.data,
        status: response.status,
      });
    }
    throw new ApiClientError("Dữ liệu phản hồi không đúng hợp đồng.", {
      code: "INTERNAL_ERROR",
      recoverable: false,
      status: response.status,
      details: { issues: envelope.error.issues },
    });
  }

  if (!envelope.data.ok) {
    throw new ApiClientError(envelope.data.error.message, {
      ...envelope.data.error,
      status: response.status,
    });
  }

  const data = dataSchema.safeParse(envelope.data.data);
  if (!data.success) {
    throw new ApiClientError("Dữ liệu phản hồi không đúng hợp đồng.", {
      code: "INTERNAL_ERROR",
      recoverable: false,
      status: response.status,
      details: { issues: data.error.issues },
    });
  }
  return data.data;
}

type RequestApiOptions = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit;
  fetcher?: typeof fetch;
};

export async function requestApi<TSchema extends z.ZodType>(
  path: `/api/${string}`,
  dataSchema: TSchema,
  options: RequestApiOptions = {},
) {
  const { fetcher = fetch, headers: headerInit, ...requestInit } = options;
  const headers = new Headers(headerInit);
  headers.set("accept", "application/json");
  const token = authStore.getState().accessToken;
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (requestInit.body && !(requestInit.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  const response = await fetcher(path, {
    ...requestInit,
    credentials: "include",
    headers,
  });
  if (response.status === 401) {
    authStore.getState().logout();
  }

  return parseApiResponse(response, dataSchema);
}
