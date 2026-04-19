import { StyleSheet, Text, View } from "react-native";
import { useCreateFlowTheme } from "../ui";
import { fonts } from "../../theme";

type Props = {
  buyerPays: string | null;
  platformFee: string | null;
  platformFeeLabel?: string;
  affiliateImpact?: string | null;
  youReceive: string | null;
  currency?: string;
};

export function EarningsPreviewCard({
  buyerPays,
  platformFee,
  platformFeeLabel = "Platform fee",
  affiliateImpact,
  youReceive
}: Props) {
  const t = useCreateFlowTheme();
  const hasPrice = Boolean(buyerPays);

  return (
    <View style={[t.card, { gap: 10 }]}>
      <Text style={[t.upperLabel, { marginTop: 0 }]}>Earnings preview</Text>
      {!hasPrice ? (
        <Text style={[t.helper, { fontStyle: "italic" }]}>Enter a price to see earnings</Text>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={[t.helper, { flex: 1 }]}>Buyer pays</Text>
            <Text
              style={[
                t.helper,
                { fontFamily: fonts.semiBold, fontWeight: "700" as const, color: t.f.createFlowInk ?? "#0A0A0B" }
              ]}
            >
              {buyerPays}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={[t.helper, { flex: 1 }]}>{platformFeeLabel}</Text>
            <Text style={t.helper}>{platformFee}</Text>
          </View>
          {affiliateImpact ? (
            <View style={styles.row}>
              <Text style={[t.helper, { flex: 1 }]}>Affiliate impact (up to 7%)</Text>
              <Text style={t.helper}>{affiliateImpact}</Text>
            </View>
          ) : null}
          <View style={[styles.divider, { backgroundColor: t.f.glassBorder }]} />
          <View style={styles.row}>
            <Text style={[t.sectionTitle, { marginBottom: 0, fontSize: 15 }]}>You receive (est.)</Text>
            <Text style={{ fontSize: 17, fontWeight: "700" as const, color: t.f.accentGold }}>{youReceive}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4
  }
});
