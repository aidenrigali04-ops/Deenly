export type UserSession = {
  id: number;
  email: string;
  username?: string;
  role: string;
  createdAt: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = {
  user: {
    id: number;
    email: string;
    username?: string;
    role: string;
    created_at: string;
  };
  tokens: AuthTokens;
};

export type FeedItem = {
  id: number;
  author_id: number;
  post_type: "recitation" | "community" | "short_video";
  content: string;
  media_url: string | null;
  media_mime_type?: string | null;
  style_tag: string | null;
  created_at: string;
  author_display_name: string;
  author_avatar_url?: string | null;
  is_following_author?: boolean;
  attached_product_id?: number | null;
  attached_product_title?: string | null;
  attached_product_price_minor?: number | null;
  attached_product_currency?: string | null;
  benefited_count: number;
  comment_count: number;
  reflect_later_count: number;
  view_count?: number;
  avg_watch_time_ms?: number;
  avg_completion_rate?: number;
};
