import { http } from "../http";
import type { DeskThread, SupportMessage, SupportThread, TypingState } from "./types";

export interface ThreadListResponse {
  threads: SupportThread[];
  guest_token: string | null;
  /** False when nobody is at the desk, so the widget can say so up front. */
  staffed: boolean;
}

export interface TranscriptResponse {
  thread: SupportThread;
  messages: SupportMessage[];
  typing: TypingState | null;
  staffed: boolean;
}

export interface SendResponse {
  ok: true;
  thread: SupportThread;
  message: SupportMessage;
  messages: SupportMessage[];
  guest_token: string | null;
  staffed: boolean;
}

export const supportApi = {
  myThreads: () => http.get<ThreadListResponse>("/api/support/threads/mine"),

  transcript: (id: number) => http.get<TranscriptResponse>(`/api/support/threads/mine/${id}`),

  /** Leaving `threadId` out starts a new conversation. */
  send: (body: string, threadId?: number | null, name?: string) =>
    http.post<SendResponse>("/api/support/messages", { body, thread_id: threadId ?? undefined, name }),

  typing: (id: number, stopped = false) => http.post<{ ok: true }>(`/api/support/threads/${id}/typing`, { stopped }),
};

export interface DeskTranscript {
  thread: DeskThread;
  messages: SupportMessage[];
  transfers: { created_at: string; note: string; from_name: string | null; to_name: string | null }[];
  typing: TypingState | null;
  visitor_online: boolean;
  online_admins: { id: number; name: string }[];
}

export const deskSupportApi = {
  threads: (options: { status?: string; mine?: boolean } = {}) =>
    http.get<{ threads: DeskThread[]; online_admins: { id: number; name: string }[] }>(
      `/api/support/threads${http.query({ status: options.status, mine: options.mine ? 1 : undefined })}`
    ),

  thread: (id: number) => http.get<DeskTranscript>(`/api/support/threads/${id}`),

  reply: (id: number, body: string) =>
    http.post<{ ok: true; message: SupportMessage; messages: SupportMessage[] }>(`/api/support/threads/${id}/reply`, {
      body,
    }),

  typing: (id: number, stopped = false) => http.post<{ ok: true }>(`/api/support/threads/${id}/typing`, { stopped }),

  roster: () =>
    http
      .get<{ admins: { id: number; name: string; email: string; role: string; online: boolean }[] }>(
        "/api/support/admins"
      )
      .then((r) => r.admins),

  handOver: (id: number, toAdminId: number, note: string) =>
    http.post<{ ok: true; assigned_admin_id: number; assigned_admin_name: string }>(
      `/api/support/threads/${id}/forward`,
      { to_admin_id: toAdminId, note }
    ),

  setStatus: (id: number, status: "open" | "closed") => http.patch<{ ok: true }>(`/api/support/threads/${id}`, { status }),

  remove: (id: number) => http.del<{ ok: true }>(`/api/support/threads/${id}`),
};
