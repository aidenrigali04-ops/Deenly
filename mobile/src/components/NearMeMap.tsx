import { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import type { BusinessListing } from "../lib/businesses";
import type { EventRecord } from "../lib/events";
import { colors, radii } from "../theme";

export type NearMapSelection =
  | { kind: "business"; item: BusinessListing }
  | { kind: "event"; item: EventRecord }
  | null;

type Props = {
  center: { lat: number; lng: number };
  businesses: BusinessListing[];
  events: EventRecord[];
  selection: NearMapSelection;
  onSelect: (next: NearMapSelection) => void;
  /** When true, user denied location or we fell back — show a pin instead of the OS user dot. */
  locationIsApproximate: boolean;
};

export function NearMeMap({
  center,
  businesses,
  events,
  selection,
  onSelect,
  locationIsApproximate
}: Props) {
  const initialRegion = useMemo(
    () => ({
      latitude: center.lat,
      longitude: center.lng,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    }),
    [center.lat, center.lng]
  );

  const businessPin = Platform.OS === "ios" ? "green" : "red";
  const eventPin = Platform.OS === "ios" ? "purple" : "blue";

  return (
    <View style={styles.border}>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        onPress={() => onSelect(null)}
        showsUserLocation={!locationIsApproximate}
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        accessibilityLabel="Map of businesses and events near you"
      >
        {locationIsApproximate ? (
          <Marker
            coordinate={{ latitude: center.lat, longitude: center.lng }}
            title="Approximate area"
            description="Enable location for your exact position"
            pinColor={Platform.OS === "ios" ? "blue" : undefined}
          />
        ) : null}
        {businesses.map((b) => (
          <Marker
            key={`biz-${b.id}`}
            coordinate={{ latitude: b.latitude, longitude: b.longitude }}
            title={b.name}
            description={b.category || "Business"}
            pinColor={businessPin}
            tracksViewChanges={false}
            onPress={() => onSelect({ kind: "business", item: b })}
            opacity={selection?.kind === "business" && selection.item.id === b.id ? 1 : 0.88}
          />
        ))}
        {events.map((ev) =>
          ev.latitude != null && ev.longitude != null ? (
            <Marker
              key={`evt-${ev.id}`}
              coordinate={{ latitude: ev.latitude, longitude: ev.longitude }}
              title={ev.title}
              description="Event"
              pinColor={eventPin}
              tracksViewChanges={false}
              onPress={() => onSelect({ kind: "event", item: ev })}
              opacity={selection?.kind === "event" && selection.item.id === ev.id ? 1 : 0.88}
            />
          ) : null
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  border: {
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden"
  },
  map: {
    width: "100%",
    height: 240
  }
});
