import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

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
  youReceive,
}: Props) {
  const hasPrice = Boolean(buyerPays);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Earnings preview</Text>
      {!hasPrice ? (
        <Text style={styles.empty}>Enter a price to see earnings</Text>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Buyer pays</Text>
            <Text style={styles.rowValueBold}>{buyerPays}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{platformFeeLabel}</Text>
            <Text style={styles.rowValue}>{platformFee}</Text>
          </View>
          {affiliateImpact ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Affiliate impact (up to 7%)</Text>
              <Text style={styles.rowValue}>{affiliateImpact}</Text>
            </View>
          ) : null}
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.receiveLabel}>You receive (est.)</Text>
            <Text style={styles.receiveValue}>{youReceive}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  heading: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  empty: {
    fontSize: 14,
    color: colors.muted,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  rowValue: {
    fontSize: 14,
    color: colors.muted,
  },
  rowValueBold: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: "#EBEBEB",
    marginVertical: 4,
  },
  receiveLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  receiveValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.accent,
  },
});
