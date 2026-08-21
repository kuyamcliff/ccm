import { http } from "../http";
import type {
  EventType,
  GalleryPhoto,
  LegalPage,
  MenuItem,
  MenuItem as PopularItem,
  Offer,
  Review,
  SiteSettings,
  User,
} from "./types";

/**
 * Everything the first paint needs, in one response.
 *
 * See `backend/src/routes/bootstrap.ts` for why this endpoint exists. In short:
 * the site used to make three sequential round trips before it knew the URL of
 * a single photograph.
 */
export interface BootPayload {
  /** Null for a visitor. Exactly what `/api/auth/me` would have returned. */
  user: User | null;
  settings: SiteSettings;
  topItems: PopularItem[];
  topReview: Review | null;
}

/** Everything a signed-out visitor can read or send. */
export const publicApi = {
  /**
   * The one request the app opens with.
   *
   * Falls back to the three separate calls if the endpoint is not there. That
   * is not defensive padding: the frontend and the backend deploy separately, to
   * Vercel and to Render, and there is a window during any release where a
   * browser holding the new bundle is talking to the old API. Without this, that
   * window is a white screen.
   */
  boot: async (): Promise<BootPayload> => {
    try {
      return await http.get<BootPayload>("/api/bootstrap");
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 404) throw error;

      const [user, settings, highlights] = await Promise.all([
        http.get<{ user: User }>("/api/auth/me").then((r) => r.user).catch(() => null),
        http.get<{ settings: SiteSettings }>("/api/site-settings").then((r) => r.settings),
        http.get<{ topReview: Review | null; topItems: PopularItem[] }>("/api/popular"),
      ]);
      return { user, settings, topItems: highlights.topItems, topReview: highlights.topReview };
    }
  },

  menu: () => http.get<{ menu: MenuItem[] }>("/api/menu").then((r) => r.menu),

  settings: () => http.get<{ settings: SiteSettings }>("/api/site-settings").then((r) => r.settings),

  /** One standout review and the dishes to lead with, for the home page. */
  highlights: () => http.get<{ topReview: Review | null; topItems: PopularItem[] }>("/api/popular"),

  offers: () => http.get<{ offers: Offer[] }>("/api/offers").then((r) => r.offers),

  legalPage: (slug: "terms" | "privacy") => http.get<{ page: LegalPage }>(`/api/legal/${slug}`).then((r) => r.page),

  reviews: () => http.get<{ reviews: Review[] }>("/api/reviews").then((r) => r.reviews),

  saveReview: (rating: number, text: string, mediaUrls: string[] = []) =>
    http.post<{ review: Review }>("/api/reviews", { rating, text, media_urls: mediaUrls }).then((r) => r.review),

  deleteMyReview: () => http.del<{ ok: true }>("/api/reviews/mine"),

  voteReview: (id: number, vote: "like" | "dislike") =>
    http.post<{ likes: number; dislikes: number; user_vote: "like" | "dislike" }>(`/api/reviews/${id}/vote`, { vote }),

  clearReviewVote: (id: number) =>
    http.del<{ likes: number; dislikes: number; user_vote: null }>(`/api/reviews/${id}/vote`),

  replyToReview: (id: number, text: string) => http.post<{ reply: unknown }>(`/api/reviews/${id}/replies`, { text }),

  deleteReviewReply: (replyId: number) => http.del<{ ok: true }>(`/api/reviews/replies/${replyId}`),

  gallery: () => http.get<{ photos: GalleryPhoto[] }>("/api/gallery").then((r) => r.photos),

  /** Sends a photo for the owner to approve. `imageUrl` is a base64 data URI. */
  submitPhoto: (imageUrl: string, caption: string) =>
    http.post<{ ok: true; message: string }>("/api/gallery", { image_url: imageUrl, caption }),

  enquireAboutEvent: (input: {
    name: string;
    email: string;
    phone: string;
    event_type: EventType;
    date: string;
    time: string;
    guest_count: number;
    note?: string;
  }) => http.post<{ ok: true }>("/api/events", input),

  waitlist: () => http.get<{ waiting: number; est_wait_minutes: number }>("/api/waitlist"),

  joinWaitlist: (input: { name: string; phone: string; party_size: number; note?: string }) =>
    http.post<{ id: number; position: number; est_wait_minutes: number }>("/api/waitlist", input),

  /** Checks a discount code before it is committed to an order. */
  checkPromo: (code: string, spendFcfa: number) =>
    http.post<{ valid: true; code: string; type: string; value: number; description: string; discount_fcfa: number }>(
      "/api/promos/validate",
      { code, spend_fcfa: spendFcfa }
    ),

  checkGiftCard: (code: string) =>
    http.post<{ valid: true; code: string; initial_value_fcfa: number; remaining_value_fcfa: number }>(
      "/api/gift-cards/validate",
      { code }
    ),
};
