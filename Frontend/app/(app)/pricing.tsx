import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/theme/colors";
import { router } from "expo-router";

type PricingTier = {
  id: string;
  name: string;
  price: number;
  tryons: number;
  popular?: boolean;
};

const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tryons: 3,
  },
  {
    id: "starter",
    name: "Starter Pack",
    price: 499,
    tryons: 15,
    popular: true,
  },
  {
    id: "pro",
    name: "Pro Pack",
    price: 699,
    tryons: 25,
  },
];

export default function PricingScreen() {
  const handleSelectPlan = (tier: PricingTier) => {
    if (tier.id === "free") {
      Alert.alert(
        "Free Tier",
        "All new users start with 3 free try-ons! Sign up to get started.",
        [{ text: "OK" }]
      );
      return;
    }

    // Show coming soon message for paid tiers
    Alert.alert(
      "Coming Soon! 🚀",
      "In-app purchases are coming soon.\n\nStay tuned for updates!",
      [{ text: "OK" }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pricing Plans</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>Create. Try. Repeat.</Text>
          <Text style={styles.heroSubtitle}>
            Explore styles, refine details, and bring your{"\n"}fashion vision to life.
          </Text>
        </View>

        {/* Pricing Cards */}
        <View style={styles.pricingContainer}>
          {PRICING_TIERS.map((tier) => (
            <TouchableOpacity
              key={tier.id}
              onPress={() => handleSelectPlan(tier)}
              activeOpacity={0.8}
              style={[
                styles.pricingCard,
                tier.popular && styles.popularCard,
              ]}
            >
              {tier.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>Most Popular</Text>
                </View>
              )}

              <Text style={styles.tierName}>{tier.name}</Text>

              <View style={styles.priceRow}>
                {tier.price === 0 ? (
                  <Text style={styles.price}>Free</Text>
                ) : (
                  <>
                    <Text style={styles.currency}>₹ </Text>
                    <Text style={styles.price}>{tier.price.toLocaleString()}</Text>
                    <Text style={styles.period}> / One-time</Text>
                  </>
                )}
              </View>

              <Text style={styles.tryonsText}>
                {tier.price === 0
                  ? `Get ${tier.tryons} free try-ons to start your journey`
                  : `Unlock ${tier.tryons} stunning virtual try-ons`
                }
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity>
            <Text style={styles.footerLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}> • </Text>
          <TouchableOpacity>
            <Text style={styles.footerLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroSection: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: "center",
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 12,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 24,
  },
  pricingContainer: {
    paddingHorizontal: 20,
    gap: 16,
    marginTop: 8,
  },
  pricingCard: {
    backgroundColor: "rgba(30, 30, 30, 0.8)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    position: "relative",
  },
  popularCard: {
    borderColor: "#D4AF37",
    borderWidth: 3,
  },
  popularBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "#D4AF37",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  popularText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#000",
  },
  tierName: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 12,
  },
  currency: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  price: {
    fontSize: 32,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  period: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
  },
  tryonsText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 32,
  },
  footerLink: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    textDecorationLine: "underline",
  },
  footerDot: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
  },
});
