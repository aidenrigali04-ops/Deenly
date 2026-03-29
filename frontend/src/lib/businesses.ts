import { apiRequest } from "@/lib/api";

export type BusinessListing = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  websiteUrl?: string | null;
  addressDisplay?: string | null;
  latitude: number;
  longitude: number;
  category?: string | null;
  visibility: string;
  ownerUserId?: number | null;
  distanceM?: number;
  createdAt?: string;
  updatedAt?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

export async function fetchBusinessesNear(params: { lat: number; lng: number; radiusM?: number; limit?: number }) {
  const q = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    radiusM: String(params.radiusM ?? 15000),
    limit: String(params.limit ?? 40)
  });
  return apiRequest<{ items: BusinessListing[] }>(`/businesses/near?${q.toString()}`, {});
}

export async function fetchBusiness(id: number) {
  return apiRequest<BusinessListing>(`/businesses/${id}`, { auth: true });
}

export async function createBusiness(body: {
  name: string;
  description?: string | null;
  category?: string | null;
  addressDisplay?: string | null;
  websiteUrl?: string | null;
  latitude: number;
  longitude: number;
  visibility?: "draft" | "published";
}) {
  return apiRequest<BusinessListing>("/businesses", {
    method: "POST",
    auth: true,
    body: {
      ...body,
      visibility: body.visibility ?? "published"
    }
  });
}

export async function businessChatAsk(businessId: number, question: string, surface?: string) {
  return apiRequest<{ reply: string }>("/ai/business-chat", {
    method: "POST",
    auth: true,
    body: {
      businessId,
      surface: surface ?? "profile",
      messages: [{ role: "user", content: question }]
    }
  });
}
