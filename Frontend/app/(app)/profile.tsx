import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/theme/colors";
import { useAuth } from "../../src/context/AuthContext";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type UserData = {
  id: string;
  email: string;
  created_at: string;
  wardrobe_count: number;
  available_tryons: number;
  user_tier?: string;
};

export default function ProfileScreen() {
  const { logout } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, []);

  async function fetchUserData() {
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        router.replace("/signin");
        return;
      }

      const response = await fetch("https://api.tryonapp.in/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user data");
      }

      const data = await response.json();
      setUserData(data.user);
    } catch (error) {
      console.error("Error fetching user data:", error);
      Alert.alert("Error", "Failed to load profile data");
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/signin");
        },
      },
    ]);
  };

  const handleSupport = () => {
    router.push("/support");
  };

  const handlePrivacyPolicy = () => {
    router.push("/privacy");
  };

  const handleTermsOfService = () => {
    router.push("/terms");
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.textPrimary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Account Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Details</Text>

          <BlurView intensity={20} tint="dark" style={styles.card}>
            <View style={styles.cardItem}>
              <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} />
              <Text style={styles.cardLabel}>Email</Text>
              <Text style={styles.cardValue}>{userData?.email || "Not available"}</Text>
            </View>
          </BlurView>

          <BlurView intensity={20} tint="dark" style={styles.card}>
            <View style={styles.cardItem}>
              <Ionicons name="shirt-outline" size={20} color={COLORS.textSecondary} />
              <Text style={styles.cardLabel}>Wardrobe Items</Text>
              <Text style={styles.cardValue}>{userData?.wardrobe_count || 0}</Text>
            </View>
          </BlurView>

          <BlurView intensity={20} tint="dark" style={styles.card}>
            <View style={styles.cardItem}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.textSecondary} />
              <Text style={styles.cardLabel}>Member Since</Text>
              <Text style={styles.cardValue}>
                {userData?.created_at
                  ? new Date(userData.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : "Unknown"}
              </Text>
            </View>
          </BlurView>
        </View>

        {/* Subscription Section - Show for free users or when credits are 0 */}
        {userData && (userData.user_tier === 'free' || userData.available_tryons === 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subscription</Text>

            <TouchableOpacity onPress={() => router.push("/pricing")} activeOpacity={0.7}>
              <BlurView intensity={20} tint="dark" style={styles.card}>
                <View style={styles.cardItem}>
                  <Ionicons name="diamond-outline" size={20} color="#FFC107" />
                  <Text style={styles.cardLabel}>
                    {userData.user_tier === 'free' ? 'View Pricing Plans' : 'Get More Try-Ons'}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                </View>
              </BlurView>
            </TouchableOpacity>
          </View>
        )}

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>

          <TouchableOpacity onPress={handleSupport} activeOpacity={0.7}>
            <BlurView intensity={20} tint="dark" style={styles.card}>
              <View style={styles.cardItem}>
                <Ionicons name="help-circle-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.cardLabel}>Help & Support</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </View>
            </BlurView>
          </TouchableOpacity>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          
          <TouchableOpacity onPress={handlePrivacyPolicy} activeOpacity={0.7}>
            <BlurView intensity={20} tint="dark" style={styles.card}>
              <View style={styles.cardItem}>
                <Ionicons name="shield-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.cardLabel}>Privacy Policy</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </View>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleTermsOfService} activeOpacity={0.7}>
            <BlurView intensity={20} tint="dark" style={styles.card}>
              <View style={styles.cardItem}>
                <Ionicons name="document-text-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.cardLabel}>Terms of Service</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </View>
            </BlurView>
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          onPress={handleLogout}
          style={styles.logoutButton}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 12,
    paddingLeft: 4,
  },
  card: {
    borderRadius: 16,
    marginBottom: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  cardLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: "500",
  },
  cardValue: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dc2626",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});

