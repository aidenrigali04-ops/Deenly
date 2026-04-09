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
    createdAt: string;
  };
  tokens: AuthTokens;
};

export type FeedEventPayload = {
  id: number;
  host_user_id: number;
  host_display_name: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  timezone?: string | null;
  is_online: boolean;
  online_url?: string | null;
  address_display?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  visibility: string;
  capacity?: number | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  viewer_rsvp_status?: string | null;
  rsvp_interested_count: number;
  rsvp_going_count: number;
  can_join_chat: boolean;
  event_rank_score?: number;
};

export type FeedEventCardItem = {
  id: string;
  post_type: "event";
  card_type: "event";
  event: FeedEventPayload;
  sponsored?: boolean;
  sponsored_label?: string | null;
  ad_campaign_id?: number | null;
};

export type FeedItem = {
  id: number;
  author_id: number;
  post_type: "post" | "marketplace" | "reel";
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
  attached_product_type?: "digital" | "service" | "subscription" | null;
  attached_product_website_url?: string | null;
  is_business_post?: boolean;
  audience_target?: "b2b" | "b2c" | "both";
  business_category?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  tags?: string[];
  liked_by_viewer?: boolean;
  sponsored?: boolean;
  sponsored_label?: string | null;
  ad_campaign_id?: number | null;
  benefited_count: number;
  comment_count: number;
  reflect_later_count: number;
  view_count?: number;
  avg_watch_time_ms?: number;
  avg_completion_rate?: number;
};

export type FeedListItem = FeedItem | FeedEventCardItem;
