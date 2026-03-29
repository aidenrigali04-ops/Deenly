import { apiRequest } from "./api";

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
  distanceM?: number;
};

export async function fetchBusinessesNear(params: { lat: number; lng: number; radiusM?: number; limit?: number }) {
  const q = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    radiusM: String(params.radiusM ?? 25000),
    limit: String(params.limit ?? 50)
  });
  return apiRequest<{ items: BusinessListing[] }>(`/businesses/near?${q.toString()}`);
}
