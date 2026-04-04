"use client";

import { useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { BusinessListing } from "@/lib/businesses";
import type { EventRecord } from "@/lib/events";
import styles from "./near-me-map.module.css";

export type NearMapSelection =
  | { kind: "business"; item: BusinessListing }
  | { kind: "event"; item: EventRecord }
  | null;

function pinIcon(color: string, size: number) {
  return L.divIcon({
    className: styles.pinWrap,
    html: `<div class="${styles.pinDot}" style="width:${size}px;height:${size}px;background:${color}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function MapSurfaceClick({ onClear }: { onClear: () => void }) {
  useMapEvents({
    click: () => onClear()
  });
  return null;
}

export function NearMeMap({
  center,
  businesses,
  events,
  onSelect
}: {
  center: { lat: number; lng: number };
  businesses: BusinessListing[];
  events: EventRecord[];
  onSelect: (s: NearMapSelection) => void;
}) {
  const userIcon = useMemo(() => pinIcon("#1a73e8", 22), []);
  const businessIcon = useMemo(() => pinIcon("#0d9488", 18), []);
  const eventIcon = useMemo(() => pinIcon("#7c3aed", 18), []);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      className={styles.map}
      zoomControl={false}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <ZoomControl position="bottomright" />
      <MapSurfaceClick onClear={() => onSelect(null)} />
      <Marker position={[center.lat, center.lng]} icon={userIcon} />
      {businesses.map((b) => (
        <Marker
          key={`biz-${b.id}`}
          position={[b.latitude, b.longitude]}
          icon={businessIcon}
          eventHandlers={{
            click: () => onSelect({ kind: "business", item: b })
          }}
        />
      ))}
      {events.map((ev) =>
        ev.latitude != null && ev.longitude != null ? (
          <Marker
            key={`evt-${ev.id}`}
            position={[ev.latitude, ev.longitude]}
            icon={eventIcon}
            eventHandlers={{
              click: () => onSelect({ kind: "event", item: ev })
            }}
          />
        ) : null
      )}
    </MapContainer>
  );
}
