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
} from "./types";

/** Everything a signed-out visitor can read or send. */
export const publicApi = {
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
