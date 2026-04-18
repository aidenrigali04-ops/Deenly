import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { colors, figmaMobile, figmaMobileNav, fonts } from "../theme";
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
import { RewardsWalletScreen } from "../screens/app/RewardsWalletScreen";
import { ReferralsScreen } from "../screens/app/ReferralsScreen";
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
  SearchTab: undefined;
  MarketplaceTab: undefined;
  ReelsTab: undefined;
  MessagesTab: { openUserId?: number };
  AccountTab: undefined;
};

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: { referralCode?: string } | undefined;
  AppTabs: NavigatorScreenParams<AppTabParamList> | undefined;
  /** Create hub + post composer (was center tab; now root stack). */
  CreateFlow: NavigatorScreenParams<CreateTabStackParamList> | undefined;
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
  Notifications: undefined;
  AddBusiness: undefined;
  BusinessDetail: { id: number };
  BusinessesNearMe: undefined;
  Settings: undefined;
  EditProfile: undefined;
  Purchases: undefined;
  RewardsWallet: undefined;
  Referrals: undefined;
  NavigateApp: undefined;
  AdminHub: undefined;
  CreateEvent: undefined;
  EventDetail: { id: number; inviteToken?: string };
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<AppTabParamList>();
const CreateStack = createNativeStackNavigator<CreateTabStackParamList>();

function TabIconFrame({ focused, children }: { focused: boolean; children: ReactNode }) {
  return (
    <View style={[tabIconFrameStyles.base, focused ? tabIconFrameStyles.on : tabIconFrameStyles.off]}>{children}</View>
  );
}

const tabIconFrameStyles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: figmaMobileNav.tabIconFrameMinWidth,
    minHeight: figmaMobileNav.tabIconFrameMinHeight,
    paddingHorizontal: figmaMobileNav.tabIconFramePadHorizontal,
    paddingVertical: figmaMobileNav.tabIconFramePadVertical,
    borderRadius: figmaMobileNav.tabIconFrameRadius
  },
  off: {
    backgroundColor: "transparent"
  },
  on: {
    backgroundColor: figmaMobileNav.tabIconFrameFillFocused,
    borderWidth: figmaMobileNav.tabBarBorderWidth,
    borderColor: figmaMobileNav.tabIconFrameBorderFocused
  }
});

function CreateTabFlow() {
  return (
    <CreateStack.Navigator
      initialRouteName="CreateHub"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: figmaMobile.canvas }
      }}
    >
      <CreateStack.Screen name="CreateHub" component={CreateHubScreen} />
      <CreateStack.Screen name="CreatePost" component={CreateScreen} />
    </CreateStack.Navigator>
  );
}

function AppTabs() {
  const insets = useSafeAreaInsets();
  const tabPadBottom = Math.max(insets.bottom, figmaMobileNav.tabBarInsetBottomMin);
  const horizontalInset = figmaMobileNav.tabBarInsetHorizontal;
  const user = useSessionStore((s) => s.user);
  const { data: convData } = useQuery({
    queryKey: ["mobile-messages-conversations"],
    queryFn: () =>
      apiRequest<{ items: { unread_count: number }[] }>("/messages/conversations?limit=25", { auth: true }),
    enabled: Boolean(user?.id),
    staleTime: 20_000
  });
  const hasUnreadMessages = useMemo(() => {
    return (convData?.items || []).some((row) => (row.unread_count || 0) > 0);
  }, [convData?.items]);

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
              backgroundColor: figmaMobile.tabBarFill,
              borderTopWidth: 0,
              borderWidth: figmaMobileNav.tabBarBorderWidth,
              borderColor: figmaMobile.tabBarBorder,
              borderRadius: figmaMobileNav.tabBarCapsuleBorderRadius,
              paddingTop: figmaMobileNav.tabBarPaddingTop,
              paddingBottom: figmaMobileNav.tabBarPaddingBottom,
              minHeight: figmaMobileNav.tabBarMinHeight,
              elevation: figmaMobileNav.tabBarElevationAndroid,
              shadowColor: figmaMobileNav.tabBarShadowColorIOS,
              shadowOffset: {
                width: figmaMobileNav.tabBarShadowOffsetXIOS,
                height: figmaMobileNav.tabBarShadowOffsetYIOS
              },
              shadowOpacity: figmaMobileNav.tabBarShadowOpacityIOS,
              shadowRadius: figmaMobileNav.tabBarShadowRadiusIOS
            },
            tabBarActiveTintColor: figmaMobile.text,
            tabBarInactiveTintColor: figmaMobile.textMuted2,
            tabBarActiveBackgroundColor: "transparent",
            tabBarShowLabel: true,
            tabBarLabel: ({ focused, color, children }) => (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  fontFamily: focused ? fonts.bold : fonts.semiBold,
                  fontSize: figmaMobileNav.tabLabelFontSize,
                  fontWeight: focused ? "700" : "600",
                  marginTop: figmaMobileNav.tabLabelMarginTop,
                  letterSpacing: figmaMobileNav.tabLabelLetterSpacing,
                  color,
                  opacity: focused ? 1 : 0.72,
                  textAlign: "center",
                  maxWidth: figmaMobileNav.tabLabelMaxWidth
                }}
              >
                {children}
              </Text>
            ),
            tabBarLabelStyle: {
              marginTop: 0
            },
            tabBarIconStyle: { marginTop: 0 },
            tabBarItemStyle: {
              paddingVertical: 0,
              paddingHorizontal: 0
            },
            tabBarBackground: () => (
              <View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: figmaMobile.tabBarFill,
                  borderRadius: figmaMobileNav.tabBarCapsuleBorderRadius,
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
                <TabIconFrame focused={focused}>
                  <Ionicons name={focused ? "home" : "home-outline"} size={(size ?? 24) - 2} color={color} />
                </TabIconFrame>
              )
            }}
          />
          <Tab.Screen
            name="SearchTab"
            component={SearchScreen}
            options={{
              title: "Discover",
              tabBarIcon: ({ color, size, focused }) => (
                <TabIconFrame focused={focused}>
                  <Ionicons name={focused ? "search" : "search-outline"} size={(size ?? 24) - 2} color={color} />
                </TabIconFrame>
              )
            }}
          />
          <Tab.Screen
            name="MarketplaceTab"
            component={MarketplaceFeedScreen}
            options={{
              title: "Market",
              tabBarIcon: ({ color, size, focused }) => (
                <TabIconFrame focused={focused}>
                  <NavTabIcon kind="marketplace" color={color} size={(size ?? 24) - 2} focused={focused} />
                </TabIconFrame>
              )
            }}
          />
          <Tab.Screen
            name="ReelsTab"
            component={ReelsScreen}
            options={{
              title: "Reels",
              tabBarIcon: ({ color, size, focused }) => (
                <TabIconFrame focused={focused}>
                  <Ionicons name={focused ? "videocam" : "videocam-outline"} size={(size ?? 24) - 2} color={color} />
                </TabIconFrame>
              )
            }}
          />
          <Tab.Screen
            name="MessagesTab"
            component={MessagesScreen}
            options={{
              title: "Messages",
              tabBarIcon: ({ color, size, focused }) => (
                <TabIconFrame focused={focused}>
                  <View style={{ width: 30, height: 26, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons
                      name={focused ? "chatbubbles" : "chatbubbles-outline"}
                      size={(size ?? 24) - 2}
                      color={color}
                    />
                    {hasUnreadMessages ? (
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 2,
                          width: figmaMobileNav.unreadBadgeSize,
                          height: figmaMobileNav.unreadBadgeSize,
                          borderRadius: figmaMobileNav.unreadBadgeSize / 2,
                          backgroundColor: figmaMobile.accentGold,
                          borderWidth: figmaMobileNav.unreadBadgeBorderWidth,
                          borderColor: figmaMobileNav.unreadBadgeBorderColor
                        }}
                      />
                    ) : null}
                  </View>
                </TabIconFrame>
              )
            }}
          />
          <Tab.Screen
            name="AccountTab"
            component={ProfileScreen}
            options={{
              title: "Profile",
              tabBarIcon: ({ color, size, focused }) => (
                <TabIconFrame focused={focused}>
                  <NavTabIcon kind="user" color={color} size={(size ?? 24) - 2} focused={focused} />
                </TabIconFrame>
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
      background: user ? figmaMobile.canvas : colors.background,
      card: user ? figmaMobile.card : colors.surface,
      text: user ? figmaMobile.text : colors.text,
      border: user ? figmaMobile.glassBorder : colors.border,
      primary: user ? figmaMobile.accentGold : colors.accent
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
          Signup: {
            path: "signup",
            parse: {
              referralCode: (value?: string) => {
                if (typeof value !== "string") {
                  return undefined;
                }
                const t = value.trim();
                return t.length > 0 ? t : undefined;
              }
            }
          },
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
            headerStyle: { backgroundColor: user ? figmaMobile.card : colors.surface },
            headerTintColor: user ? figmaMobile.text : colors.text,
            headerTitleStyle: { fontFamily: fonts.semiBold, fontSize: 17, fontWeight: "600" },
            headerBackTitleStyle: { fontFamily: fonts.regular },
            contentStyle: { backgroundColor: user ? figmaMobile.canvas : colors.background }
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
              <RootStack.Screen name="CreateFlow" component={CreateTabFlow} options={{ headerShown: false }} />
              <RootStack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: "Post" }} />
              <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: "User" }} />
              <RootStack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: "Setup & feed" }} />
              <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
              <RootStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: "Edit profile" }} />
              <RootStack.Screen name="Purchases" component={PurchasesScreen} options={{ title: "Purchases" }} />
              <RootStack.Screen name="RewardsWallet" component={RewardsWalletScreen} options={{ title: "Rewards" }} />
              <RootStack.Screen name="Referrals" component={ReferralsScreen} options={{ title: "Referrals" }} />
              <RootStack.Screen name="NavigateApp" component={NavigateAppScreen} options={{ title: "Navigate" }} />
              <RootStack.Screen name="Sessions" component={SessionsScreen} options={{ title: "Sessions" }} />
              <RootStack.Screen name="Beta" component={BetaScreen} options={{ title: "Beta" }} />
              <RootStack.Screen name="Support" component={SupportScreen} options={{ title: "Support" }} />
              <RootStack.Screen name="Guidelines" component={GuidelinesScreen} options={{ title: "Guidelines" }} />
              <RootStack.Screen name="Dhikr" component={DhikrScreen} options={{ title: "Dhikr Mode" }} />
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
