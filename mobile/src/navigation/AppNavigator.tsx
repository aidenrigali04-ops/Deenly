import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionMe } from "../lib/auth";
import { getAccessToken } from "../lib/storage";
import { useSessionStore } from "../store/session-store";
import { colors } from "../theme";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { SignupScreen } from "../screens/auth/SignupScreen";
import { WelcomeScreen } from "../screens/auth/WelcomeScreen";
import { FeedScreen } from "../screens/app/FeedScreen";
import { RecitationScreen } from "../screens/app/RecitationScreen";
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

export type AppTabParamList = {
  HomeTab: undefined;
  RecitationTab: undefined;
  MessagesTab: undefined;
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
  AppTabs: undefined;
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
          borderTopColor: colors.border
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted
      }}
    >
      <Tab.Screen name="HomeTab" component={FeedScreen} options={{ title: "Home" }} />
      <Tab.Screen
        name="RecitationTab"
        component={RecitationScreen}
        options={{ title: "Recitation" }}
      />
      <Tab.Screen name="MessagesTab" component={MessagesScreen} options={{ title: "Messages" }} />
      <Tab.Screen name="SearchTab" component={SearchScreen} options={{ title: "Search" }} />
      <Tab.Screen name="CreateTab" component={CreateScreen} options={{ title: "Upload +" }} />
      <Tab.Screen name="AccountTab" component={ProfileScreen} options={{ title: "Account" }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const [bootstrapping, setBootstrapping] = useState(true);

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
      <RootStack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text
        }}
      >
        {!user ? (
          <>
            <RootStack.Screen
              name="Welcome"
              component={WelcomeScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="Signup"
              component={SignupScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          <>
            <RootStack.Screen
              name="AppTabs"
              component={AppTabs}
              options={{ headerShown: false }}
            />
            <RootStack.Screen
              name="PostDetail"
              component={PostDetailScreen}
              options={{ title: "Post" }}
            />
            <RootStack.Screen
              name="UserProfile"
              component={UserProfileScreen}
              options={{ title: "User" }}
            />
            <RootStack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ title: "Interests" }}
            />
            <RootStack.Screen
              name="Sessions"
              component={SessionsScreen}
              options={{ title: "Sessions" }}
            />
            <RootStack.Screen name="Beta" component={BetaScreen} options={{ title: "Beta" }} />
            <RootStack.Screen
              name="Support"
              component={SupportScreen}
              options={{ title: "Support" }}
            />
            <RootStack.Screen
              name="Guidelines"
              component={GuidelinesScreen}
              options={{ title: "Guidelines" }}
            />
            <RootStack.Screen
              name="AdminModeration"
              component={AdminModerationScreen}
              options={{ title: "Admin Moderation" }}
            />
            <RootStack.Screen
              name="AdminOperations"
              component={AdminOperationsScreen}
              options={{ title: "Admin Operations" }}
            />
            <RootStack.Screen
              name="AdminAnalytics"
              component={AdminAnalyticsScreen}
              options={{ title: "Admin Analytics" }}
            />
            <RootStack.Screen
              name="AdminTables"
              component={AdminTablesScreen}
              options={{ title: "Admin Tables" }}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
