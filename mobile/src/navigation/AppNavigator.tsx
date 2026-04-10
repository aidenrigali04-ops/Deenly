import { Fragment, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { AtmosphereBackdrop } from "../components/AtmosphereBackdrop";
import {
  NavigationContainer,
  DefaultTheme,
  NavigatorScreenParams,
  type LinkingOptions
} from "@react-navigation/native";
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
import { CreateHubScreen } from "../screens/app/CreateHubScreen";
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
import { PromotePostScreen } from "../screens/app/PromotePostScreen";
import { BoostCheckoutReturnScreen } from "../screens/app/BoostCheckoutReturnScreen";
import { PlaidLinkScreen } from "../screens/app/PlaidLinkScreen";
import { CreateProductScreen } from "../screens/app/CreateProductScreen";
import { ProductDetailScreen } from "../screens/app/ProductDetailScreen";
import type { ProductImportDraft } from "../lib/monetization";
import { ReelsScreen } from "../screens/app/ReelsScreen";
import { NotificationsScreen } from "../screens/app/NotificationsScreen";
import { AddBusinessScreen } from "../screens/app/AddBusinessScreen";
import { BusinessDetailScreen } from "../screens/app/BusinessDetailScreen";
import { BusinessesNearMeScreen } from "../screens/app/BusinessesNearMeScreen";
import { SettingsScreen } from "../screens/app/SettingsScreen";
import { EditProfileScreen } from "../screens/app/EditProfileScreen";
import { PurchasesScreen } from "../screens/app/PurchasesScreen";
import { NavigateAppScreen } from "../screens/app/NavigateAppScreen";
import { AdminHubScreen } from "../screens/app/AdminHubScreen";
import { CreateEventScreen } from "../screens/app/CreateEventScreen";
import { EventDetailScreen } from "../screens/app/EventDetailScreen";
import { NavTabIcon } from "../components/icons/NavTabIcon";
import { BusinessPersonalizerOverlay } from "../components/BusinessPersonalizerOverlay";
import { getWebAppBaseUrl } from "../lib/web-app";
import { registerExpoPushDevice } from "../lib/push-registration";

export type CreateTabStackParamList = {
  CreateHub: undefined;
  CreatePost: undefined;
};

export type AppTabParamList = {
  HomeTab: undefined;
  MarketplaceTab: undefined;
  MessagesTab: { openUserId?: number };
  AccountTab: undefined;
  FeedTab: undefined;
  CreateTab: NavigatorScreenParams<CreateTabStackParamList> | undefined;
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
  PromotePost: undefined;
  BoostCheckoutReturn: { step: string };
  PlaidLink: undefined;
  CreateProduct: { initialDraft?: ProductImportDraft; editProductId?: number } | undefined;
  ProductDetail: { productId: number };
  Reels: undefined;
  Notifications: undefined;
  AddBusiness: undefined;
  BusinessDetail: { id: number };
  BusinessesNearMe: undefined;
  Settings: undefined;
  EditProfile: undefined;
  Purchases: undefined;
  NavigateApp: undefined;
  AdminHub: undefined;
  CreateEvent: undefined;
  EventDetail: { id: number; inviteToken?: string };
  Search: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<AppTabParamList>();
const CreateStack = createNativeStackNavigator<CreateTabStackParamList>();

function CreateTabFlow() {
  return (
    <CreateStack.Navigator
      initialRouteName="CreateHub"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.atmosphere }
      }}
    >
      <CreateStack.Screen name="CreateHub" component={CreateHubScreen} />
      <CreateStack.Screen name="CreatePost" component={CreateScreen} />
    </CreateStack.Navigator>
  );
}

function AppTabs() {
  const insets = useSafeAreaInsets();
  const tabPadBottom = Math.max(insets.bottom, 14);
  const horizontalInset = 16;

  return (
    <View style={{ flex: 1 }}>
      <AtmosphereBackdrop />
      <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            left: horizontalInset,
            right: horizontalInset,
            bottom: tabPadBottom,
            backgroundColor: "#FFFFFF",
            borderTopWidth: 0,
            borderWidth: 0,
            borderRadius: 24,
            paddingTop: 8,
            paddingBottom: 10,
            minHeight: 64,
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 16
          },
        tabBarActiveTintColor: "#0F0E0D",
        tabBarInactiveTintColor: "#8A8480",
        tabBarActiveBackgroundColor: "transparent",
        tabBarShowLabel: true,
        tabBarLabel: ({ focused, color, children }) => (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              fontSize: 11,
              fontWeight: focused ? "700" : "600",
              marginTop: 2,
              letterSpacing: 0,
              color,
              opacity: focused ? 1 : 0.72,
              textAlign: "center"
            }}
          >
            {children}
          </Text>
        ),
        tabBarLabelStyle: {
          marginTop: 0
        },
        tabBarIconStyle: { marginTop: 2 },
        tabBarItemStyle: {
          paddingVertical: 2
        },
        tabBarBackground: () => (
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: "#FFFFFF",
              borderRadius: 24,
              overflow: "hidden"
            }}
          />
        )
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={FeedScreen}
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <NavTabIcon kind="home" color={color} size={size ?? 24} focused={focused} />
          )
        }}
      />
      <Tab.Screen
        name="MarketplaceTab"
        component={MarketplaceFeedScreen}
        options={{
          title: "Market",
          tabBarIcon: ({ color, size, focused }) => (
            <NavTabIcon kind="marketplace" color={color} size={size ?? 24} focused={focused} />
          )
        }}
      />
      <Tab.Screen
        name="MessagesTab"
        component={MessagesScreen}
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size, focused }) => (
            <NavTabIcon kind="send" color={color} size={size ?? 24} focused={focused} />
          )
        }}
      />
      <Tab.Screen
        name="CreateTab"
        component={CreateTabFlow}
        options={{
          title: "Create",
          tabBarIcon: ({ color, size, focused }) => (
            <NavTabIcon kind="upload" color={color} size={size ?? 24} focused={focused} />
          )
        }}
      />
      <Tab.Screen
        name="AccountTab"
        component={ProfileScreen}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <NavTabIcon kind="user" color={color} size={size ?? 24} focused={focused} />
          )
        }}
      />
    </Tab.Navigator>
      </View>
    </View>
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

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    void registerExpoPushDevice();
  }, [user?.id]);

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: user ? colors.atmosphere : colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.accent
    }
  };

  const linking = useMemo((): LinkingOptions<RootStackParamList> => {
    const webOrigin = getWebAppBaseUrl().replace(/\/$/, "");
    const prefixes = [Linking.createURL("/"), webOrigin, "deenly://"];
    const eventDetail = {
      EventDetail: {
        path: "events/:id" as const,
        parse: {
          id: (id: string) => parseInt(id, 10),
          inviteToken: (token?: string) =>
            typeof token === "string" && token.trim() ? token.trim() : undefined
        }
      }
    };
    if (user) {
      return {
        prefixes,
        config: {
          screens: {
            AppTabs: "",
            PostDetail: "posts/:id",
            UserProfile: "users/:id",
            PromotePost: "creator/promote",
            BoostCheckoutReturn: {
              path: "checkout/:step",
              parse: {
                step: (s: string) => String(s || "").toLowerCase()
              }
            },
            ...eventDetail
          }
        }
      };
    }
    return {
      prefixes,
      config: {
        screens: {
          Welcome: "",
          Login: "login",
          Signup: "signup",
          ...eventDetail
        }
      }
    };
  }, [user]);

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Fragment>
        <RootStack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: user ? colors.atmosphere : colors.background }
          }}
        >
          {!user ? (
            <>
              <RootStack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
              <RootStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
              <RootStack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
              <RootStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event" }} />
            </>
          ) : (
            <>
              <RootStack.Screen name="AppTabs" component={AppTabs} options={{ headerShown: false }} />
              <RootStack.Screen name="Search" component={SearchScreen} options={{ title: "Explore" }} />
              <RootStack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: "Post" }} />
              <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: "User" }} />
              <RootStack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: "Setup & feed" }} />
              <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
              <RootStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: "Edit profile" }} />
              <RootStack.Screen name="Purchases" component={PurchasesScreen} options={{ title: "Purchases" }} />
              <RootStack.Screen name="NavigateApp" component={NavigateAppScreen} options={{ title: "Navigate" }} />
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
              <RootStack.Screen name="PromotePost" component={PromotePostScreen} options={{ title: "Promote in feed" }} />
              <RootStack.Screen
                name="BoostCheckoutReturn"
                component={BoostCheckoutReturnScreen}
                options={{ title: "Boost checkout" }}
              />
              <RootStack.Screen name="PlaidLink" component={PlaidLinkScreen} options={{ title: "Link bank (Plaid)" }} />
              <RootStack.Screen name="CreateProduct" component={CreateProductScreen} options={{ title: "Add product" }} />
              <RootStack.Screen name="CreateEvent" component={CreateEventScreen} options={{ title: "Create event" }} />
              <RootStack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: "Product" }} />
              <RootStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event" }} />
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
