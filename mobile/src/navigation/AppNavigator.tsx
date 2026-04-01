import { Fragment, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer, DefaultTheme, NavigatorScreenParams } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionMe } from "../lib/auth";
import { getAccessToken } from "../lib/storage";
import { useSessionStore } from "../store/session-store";
import { colors } from "../theme";
import { apiRequest } from "../lib/api";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { SignupScreen } from "../screens/auth/SignupScreen";
import { WelcomeScreen } from "../screens/auth/WelcomeScreen";
import { FeedScreen } from "../screens/app/FeedScreen";
import { MarketplaceFeedScreen } from "../screens/app/MarketplaceFeedScreen";
import { MessagesScreen } from "../screens/app/MessagesScreen";
import { SearchScreen } from "../screens/app/SearchScreen";
import { ProfileScreen } from "../screens/app/ProfileScreen";
import { CreateScreen } from "../screens/app/CreateScreen";
import { PostDetailScreen } from "../screens/app/PostDetailScreen";
import { UserProfileScreen } from "../screens/app/UserProfileScreen";
import { OnboardingScreen } from "../screens/app/OnboardingScreen";
import { SessionsScreen } from "../screens/app/SessionsScreen";
import { BetaScreen } from "../screens/app/BetaScreen";
import { SupportScreen } from "../screens/app/SupportScreen";
import { GuidelinesScreen } from "../screens/app/GuidelinesScreen";
import { AdminModerationScreen } from "../screens/app/AdminModerationScreen";
import { AdminOperationsScreen } from "../screens/app/AdminOperationsScreen";
import { AdminAnalyticsScreen } from "../screens/app/AdminAnalyticsScreen";
import { AdminTablesScreen } from "../screens/app/AdminTablesScreen";
import { DhikrScreen } from "../screens/app/DhikrScreen";
import { QuranReaderScreen } from "../screens/app/QuranReaderScreen";
import { SalahSettingsScreen } from "../screens/app/SalahSettingsScreen";
import { CreatorEconomyScreen } from "../screens/app/CreatorEconomyScreen";
import { ReelsScreen } from "../screens/app/ReelsScreen";
import { NotificationsScreen } from "../screens/app/NotificationsScreen";
import { AddBusinessScreen } from "../screens/app/AddBusinessScreen";
import { BusinessDetailScreen } from "../screens/app/BusinessDetailScreen";
import { BusinessesNearMeScreen } from "../screens/app/BusinessesNearMeScreen";
import { SettingsScreen } from "../screens/app/SettingsScreen";
import { AdminHubScreen } from "../screens/app/AdminHubScreen";
import { NavTabIcon } from "../components/icons/NavTabIcon";
import { BusinessPersonalizerOverlay } from "../components/BusinessPersonalizerOverlay";

export type AppTabParamList = {
  HomeTab: undefined;
  MarketplaceTab: undefined;
  MessagesTab: { openUserId?: number };
  SearchTab: undefined;
  AccountTab: undefined;
  FeedTab: undefined;
  CreateTab: undefined;
  ReflectTab: undefined;
  InboxTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  AppTabs: NavigatorScreenParams<AppTabParamList> | undefined;
  PostDetail: { id: number };
  UserProfile: { id: number };
  Onboarding: undefined;
  Sessions: undefined;
  Beta: undefined;
  Support: undefined;
  Guidelines: undefined;
  AdminModeration: undefined;
  AdminOperations: undefined;
  AdminAnalytics: undefined;
  AdminTables: undefined;
  Dhikr: undefined;
  QuranReader: undefined;
  SalahSettings: undefined;
  CreatorEconomy: undefined;
  Reels: undefined;
  Notifications: undefined;
  AddBusiness: undefined;
  BusinessDetail: { id: number };
  BusinessesNearMe: undefined;
  Settings: undefined;
  AdminHub: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<AppTabParamList>();

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: 6,
          minHeight: 58
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginBottom: 4
        },
        tabBarIconStyle: { marginTop: 2 },
        tabBarItemStyle: { paddingVertical: 4 }
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={FeedScreen}
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <NavTabIcon kind="home" color={color} size={size ?? 22} />
        }}
      />
      <Tab.Screen
        name="MarketplaceTab"
        component={MarketplaceFeedScreen}
        options={{
          title: "Market",
          tabBarIcon: ({ color, size }) => <NavTabIcon kind="marketplace" color={color} size={size ?? 22} />
        }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchScreen}
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => <NavTabIcon kind="search" color={color} size={size ?? 22} />
        }}
      />
      <Tab.Screen
        name="MessagesTab"
        component={MessagesScreen}
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => <NavTabIcon kind="send" color={color} size={size ?? 22} />
        }}
      />
      <Tab.Screen
        name="CreateTab"
        component={CreateScreen}
        options={{
          title: "Post",
          tabBarIcon: ({ color, size }) => <NavTabIcon kind="upload" color={color} size={size ?? 22} />
        }}
      />
      <Tab.Screen
        name="AccountTab"
        component={ProfileScreen}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <NavTabIcon kind="user" color={color} size={size ?? 22} />
        }}
      />
    </Tab.Navigator>
  );
}

type MeOnboarding = {
  business_onboarding_dismissed_at?: string | null;
};

function SessionPersonalizer() {
  const user = useSessionStore((s) => s.user);
  const { data, isSuccess } = useQuery({
    queryKey: ["mobile-user-me-onboarding"],
    queryFn: () => apiRequest<MeOnboarding>("/users/me", { auth: true }),
    enabled: Boolean(user)
  });
  const visible = Boolean(user && isSuccess && !data?.business_onboarding_dismissed_at);
  return <BusinessPersonalizerOverlay visible={visible} onDismiss={() => undefined} />;
}

export function AppNavigator() {
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const [bootstrapping, setBootstrapping] = useState(true);
  const adminOwnerEmail = String(process.env.EXPO_PUBLIC_ADMIN_OWNER_EMAIL || "")
    .trim()
    .toLowerCase();
  const canAccessAdmin =
    Boolean(user?.role === "admin" || user?.role === "moderator") &&
    Boolean(user?.email) &&
    Boolean(adminOwnerEmail) &&
    String(user?.email || "").toLowerCase() === adminOwnerEmail;

  const sessionQuery = useQuery({
    queryKey: ["mobile-bootstrap-session"],
    queryFn: () => fetchSessionMe(),
    enabled: false
  });

  useEffect(() => {
    let mounted = true;
    getAccessToken().then((token) => {
      if (!mounted || !token) {
        if (mounted) setBootstrapping(false);
        return;
      }
      sessionQuery
        .refetch()
        .then((result) => {
          if (result.data) setUser(result.data);
        })
        .catch(() => {
          if (mounted) setUser(null);
        })
        .finally(() => {
          if (mounted) setBootstrapping(false);
        });
    });
    return () => {
      mounted = false;
    };
  }, [sessionQuery, setUser]);

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
          primary: colors.accent
        }
      }}
    >
      <Fragment>
        <RootStack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.background }
          }}
        >
          {!user ? (
            <>
              <RootStack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
              <RootStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
              <RootStack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
            </>
          ) : (
            <>
              <RootStack.Screen name="AppTabs" component={AppTabs} options={{ headerShown: false }} />
              <RootStack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: "Post" }} />
              <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: "User" }} />
              <RootStack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: "Setup" }} />
              <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
              <RootStack.Screen name="Sessions" component={SessionsScreen} options={{ title: "Sessions" }} />
              <RootStack.Screen name="Beta" component={BetaScreen} options={{ title: "Beta" }} />
              <RootStack.Screen name="Support" component={SupportScreen} options={{ title: "Support" }} />
              <RootStack.Screen name="Guidelines" component={GuidelinesScreen} options={{ title: "Guidelines" }} />
              <RootStack.Screen name="Dhikr" component={DhikrScreen} options={{ title: "Dhikr Mode" }} />
              <RootStack.Screen name="Reels" component={ReelsScreen} options={{ title: "Reels", headerShown: false }} />
              <RootStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
              <RootStack.Screen name="QuranReader" component={QuranReaderScreen} options={{ title: "Quran Reader" }} />
              <RootStack.Screen name="SalahSettings" component={SalahSettingsScreen} options={{ title: "Salah Settings" }} />
              <RootStack.Screen name="CreatorEconomy" component={CreatorEconomyScreen} options={{ title: "Creator hub" }} />
              <RootStack.Screen name="AddBusiness" component={AddBusinessScreen} options={{ title: "Add business" }} />
              <RootStack.Screen name="BusinessDetail" component={BusinessDetailScreen} options={{ title: "Business" }} />
              <RootStack.Screen
                name="BusinessesNearMe"
                component={BusinessesNearMeScreen}
                options={{ title: "Near me" }}
              />
              {canAccessAdmin ? (
                <>
                  <RootStack.Screen name="AdminHub" component={AdminHubScreen} options={{ title: "Admin" }} />
                  <RootStack.Screen name="AdminModeration" component={AdminModerationScreen} options={{ title: "Admin Moderation" }} />
                  <RootStack.Screen name="AdminOperations" component={AdminOperationsScreen} options={{ title: "Admin Operations" }} />
                  <RootStack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} options={{ title: "Admin Analytics" }} />
                  <RootStack.Screen name="AdminTables" component={AdminTablesScreen} options={{ title: "Admin Tables" }} />
                </>
              ) : null}
            </>
          )}
        </RootStack.Navigator>
        {user ? <SessionPersonalizer /> : null}
      </Fragment>
    </NavigationContainer>
  );
}
