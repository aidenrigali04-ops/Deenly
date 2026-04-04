import { apiRequest } from "./api";

export type GeocodeItem = {
  label: string;
  latitude: number;
  longitude: number;
};

export async function geocodeSearch(q: string) {
  const params = new URLSearchParams({ q });
  return apiRequest<{ items: GeocodeItem[] }>(`/geocode/search?${params.toString()}`);
}

export async function geocodeReverse(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude)
  });
  return apiRequest<{ label: string | null; latitude: number; longitude: number }>(
    `/geocode/reverse?${params.toString()}`
  );
}
