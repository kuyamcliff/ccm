export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response; fall through
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status}).`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Reservation {
  id: number;
  date: string;
  time: string;
  party_size: number;
  phone: string;
  note: string;
  status: "confirmed" | "cancelled";
  created_at: string;
}

export interface Review {
  id: number;
  rating: number;
  text: string;
  author: string;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export const api = {
  me: () => request<{ user: User }>("/api/auth/me"),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  myReservations: () => request<{ reservations: Reservation[] }>("/api/reservations"),
  createReservation: (input: {
    date: string;
    time: string;
    partySize: number;
    phone: string;
    note: string;
  }) =>
    request<{ reservation: Reservation }>("/api/reservations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelReservation: (id: number) =>
    request<{ ok: true }>(`/api/reservations/${id}`, { method: "DELETE" }),

  reviews: () => request<{ reviews: Review[] }>("/api/reviews"),
  saveReview: (rating: number, text: string) =>
    request<{ review: Review }>("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ rating, text }),
    }),
  deleteMyReview: () => request<{ ok: true }>("/api/reviews/mine", { method: "DELETE" }),
};
