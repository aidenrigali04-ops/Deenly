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
  post_type: "post" | "recitation" | "marketplace";
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

export type PostComment = {
  id: number;
  user_id: number;
  post_id: number;
  comment_text: string;
  created_at: string;
  commenter_display_name: string;
  commenter_username: string;
  commenter_avatar_url?: string | null;
};

export type PostCommentsResponse = {
  postId: number;
  items: PostComment[];
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
};
