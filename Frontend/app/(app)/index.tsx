import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState, useRef } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = "https://api.tryonapp.in";

type GeneratedImage = {
  id: string;
  result_url: string;
  created_at: string;
  generation_time_ms: number;
};

type UserCredits = {
  available_tryons: number;
  user_tier?: string;
};

export default function HomeScreen() {
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [wardrobeCount, setWardrobeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [credits, setCredits] = useState<UserCredits>({
    available_tryons: 0,
    user_tier: 'free',
  });

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    fetchData();

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }

      // Fetch generated images (limit to 5 for recent)
      const imagesResponse = await fetch(`${API_URL}/tryon/images?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        setGeneratedImages(imagesData.images || []);
      }

      // Fetch wardrobe count
      const wardrobeResponse = await fetch(`${API_URL}/wardrobe`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (wardrobeResponse.ok) {
        const wardrobeData = await wardrobeResponse.json();
        setWardrobeCount(wardrobeData.length || 0);
      }

      // Fetch user credits
      const creditsResponse = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (creditsResponse.ok) {
        const userData = await creditsResponse.json();
        setCredits({
          available_tryons: userData.user.available_tryons || 0,
          user_tier: userData.user.user_tier || 'free',
        });
      }
    } catch (error) {
      console.error("Error fetching home data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
          />
        }
      >
        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }
          ]}
        >
          <Text style={styles.appName}>TryOn</Text>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push("/profile")}
          >
            <Image
              source={{ uri: "https://i.pravatar.cc/100" }}
              style={styles.avatar}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Credits Badge - Show pricing for free users or when credits are 0 */}
        <Animated.View
          style={[
            styles.creditsBadgeContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }
          ]}
        >
          <TouchableOpacity
            style={styles.creditsBadge}
            onPress={() => {
              // Show pricing if user is on free tier OR has 0 credits
              if (credits.user_tier === 'free' || credits.available_tryons === 0) {
                router.push("/pricing");
              }
            }}
            activeOpacity={(credits.user_tier === 'free' || credits.available_tryons === 0) ? 0.8 : 1}
          >
            <View style={styles.creditsIconContainer}>
              <Ionicons name="diamond" size={24} color="#D4AF37" />
            </View>
            <View style={styles.creditsInfo}>
              <Text style={styles.creditsLabel}>Available Try-Ons</Text>
              <Text style={styles.creditsCount}>{credits.available_tryons}</Text>
            </View>
            {(credits.user_tier === 'free' || credits.available_tryons === 0) && (
              <Ionicons name="add-circle" size={28} color="#D4AF37" />
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Quick Actions - Bento Grid */}
        <Animated.View
          style={[
            styles.bentoGrid,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }
          ]}
        >
          {/* Large Card - Try On */}
          <TouchableOpacity
            style={[styles.bentoCard, styles.bentoLarge]}
            onPress={() => router.push("/camera")}
            activeOpacity={0.8}
          >
            <View style={styles.cardContent}>
              <View style={styles.iconContainer}>
                <Ionicons name="camera" size={32} color="#FFFFFF" />
              </View>
              <Text style={styles.cardTitle}>Virtual Try-On</Text>
              <Text style={styles.cardSubtitle}>See yourself in new outfits</Text>
            </View>
            <View style={styles.cardGlow} />
          </TouchableOpacity>

          {/* Small Cards Row */}
          <View style={styles.bentoRow}>
            <TouchableOpacity
              style={[styles.bentoCard, styles.bentoSmall]}
              onPress={() => router.push("/wardrobe")}
              activeOpacity={0.8}
            >
              <View style={styles.iconContainer}>
                <Ionicons name="shirt" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.cardTitleSmall}>Wardrobe</Text>
              <Text style={styles.statNumber}>{wardrobeCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bentoCard, styles.bentoSmall]}
              onPress={() => router.push("/images")}
              activeOpacity={0.8}
            >
              <View style={styles.iconContainer}>
                <Ionicons name="images" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.cardTitleSmall}>Gallery</Text>
              <Text style={styles.statNumber}>{generatedImages.length}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Recent Generations Section */}
        {generatedImages.length > 0 && (
          <Animated.View
            style={[
              styles.recentSection,
              {
                opacity: fadeAnim,
              }
            ]}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Generations</Text>
              <TouchableOpacity onPress={() => router.push("/images")}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentScroll}
            >
              {generatedImages.map((image) => (
                <TouchableOpacity
                  key={image.id}
                  style={styles.recentCard}
                  activeOpacity={0.8}
                  onPress={() => router.push("/images")}
                >
                  <Image
                    source={{ uri: image.result_url }}
                    style={styles.recentImage}
                    contentFit="cover"
                  />
                  <View style={styles.recentOverlay}>
                    <Ionicons name="eye" size={32} color="rgba(255,255,255,0.9)" />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Empty State */}
        {generatedImages.length === 0 && (
          <Animated.View
            style={[
              styles.emptyState,
              {
                opacity: fadeAnim,
              }
            ]}
          >
            <Ionicons name="images-outline" size={64} color="#333333" />
            <Text style={styles.emptyTitle}>No Generations Yet</Text>
            <Text style={styles.emptySubtitle}>
              Start creating virtual try-ons to see them here
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#888888",
  },
  scrollContent: {
    paddingBottom: 140,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  creditsBadgeContainer: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  creditsBadge: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(212, 175, 55, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.3)",
    gap: 12,
  },
  creditsIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(212, 175, 55, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  creditsInfo: {
    flex: 1,
  },
  creditsLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 2,
  },
  creditsCount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#D4AF37",
  },
  appName: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  profileButton: {
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "#333333",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  bentoGrid: {
    paddingHorizontal: 20,
    gap: 16,
  },
  bentoCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#333333",
    overflow: "hidden",
    position: "relative",
  },
  bentoLarge: {
    height: 200,
    padding: 24,
    justifyContent: "space-between",
  },
  bentoRow: {
    flexDirection: "row",
    gap: 16,
  },
  bentoSmall: {
    flex: 1,
    height: 160,
    padding: 20,
    justifyContent: "space-between",
  },
  cardContent: {
    zIndex: 1,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#888888",
  },
  cardTitleSmall: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  cardGlow: {
    position: "absolute",
    bottom: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  recentSection: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  seeAll: {
    fontSize: 14,
    color: "#888888",
    fontWeight: "600",
  },
  recentScroll: {
    paddingHorizontal: 20,
    gap: 16,
  },
  recentCard: {
    width: 160,
    height: 220,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333333",
    position: "relative",
  },
  recentImage: {
    width: "100%",
    height: "100%",
  },
  recentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    marginTop: 60,
    paddingHorizontal: 40,
    alignItems: "center",
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#888888",
    textAlign: "center",
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#333333",
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
