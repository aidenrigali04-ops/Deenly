# Mobile route inventory and navigation graph

This document satisfies the phased cleanup plan: registered routes, screen files, navigation call sites, orphans removed, and asset references.

## Phase 1 — Registered routes (`AppNavigator.tsx`)

### Guest stack (`!user`)

| Route name   | Component              | File                                      |
| ------------ | ---------------------- | ----------------------------------------- |
| Welcome      | WelcomeScreen          | `src/screens/auth/WelcomeScreen.tsx`      |
| Login        | LoginScreen            | `src/screens/auth/LoginScreen.tsx`        |
| Signup       | SignupScreen           | `src/screens/auth/SignupScreen.tsx`       |
| EventDetail  | EventDetailScreen      | `src/screens/app/EventDetailScreen.tsx`   |

`EventDetail` is also registered when authed (see below) so deep links work in both states.

### Authed root stack (`user`)

| Route name           | Component                 | File                                           |
| -------------------- | ------------------------- | ---------------------------------------------- |
| AppTabs              | AppTabs                   | (tab navigator, inline)                        |
| Search               | SearchScreen              | `src/screens/app/SearchScreen.tsx`             |
| PostDetail           | PostDetailScreen          | `src/screens/app/PostDetailScreen.tsx`         |
| UserProfile          | UserProfileScreen         | `src/screens/app/UserProfileScreen.tsx`      |
| Onboarding           | OnboardingScreen          | `src/screens/app/OnboardingScreen.tsx`       |
| Settings             | SettingsScreen            | `src/screens/app/SettingsScreen.tsx`           |
| EditProfile          | EditProfileScreen         | `src/screens/app/EditProfileScreen.tsx`      |
| Purchases            | PurchasesScreen           | `src/screens/app/PurchasesScreen.tsx`        |
| NavigateApp          | NavigateAppScreen         | `src/screens/app/NavigateAppScreen.tsx`        |
| Sessions             | SessionsScreen            | `src/screens/app/SessionsScreen.tsx`         |
| Beta                 | BetaScreen                | `src/screens/app/BetaScreen.tsx`             |
| Support              | SupportScreen             | `src/screens/app/SupportScreen.tsx`          |
| Guidelines           | GuidelinesScreen          | `src/screens/app/GuidelinesScreen.tsx`       |
| Dhikr                | DhikrScreen               | `src/screens/app/DhikrScreen.tsx`            |
| Reels                | ReelsScreen               | `src/screens/app/ReelsScreen.tsx`            |
| Notifications        | NotificationsScreen       | `src/screens/app/NotificationsScreen.tsx`    |
| QuranReader          | QuranReaderScreen         | `src/screens/app/QuranReaderScreen.tsx`      |
| SalahSettings        | SalahSettingsScreen       | `src/screens/app/SalahSettingsScreen.tsx`    |
| CreatorEconomy       | CreatorEconomyScreen      | `src/screens/app/CreatorEconomyScreen.tsx`   |
| PromotePost          | PromotePostScreen         | `src/screens/app/PromotePostScreen.tsx`      |
| BoostCheckoutReturn  | BoostCheckoutReturnScreen | `src/screens/app/BoostCheckoutReturnScreen.tsx` |
| PlaidLink            | PlaidLinkScreen           | `src/screens/app/PlaidLinkScreen.tsx`        |
| CreateProduct        | CreateProductScreen       | `src/screens/app/CreateProductScreen.tsx`    |
| CreateEvent          | CreateEventScreen         | `src/screens/app/CreateEventScreen.tsx`      |
| ProductDetail        | ProductDetailScreen       | `src/screens/app/ProductDetailScreen.tsx`    |
| EventDetail          | EventDetailScreen         | `src/screens/app/EventDetailScreen.tsx`      |
| AddBusiness          | AddBusinessScreen         | `src/screens/app/AddBusinessScreen.tsx`      |
| BusinessDetail       | BusinessDetailScreen      | `src/screens/app/BusinessDetailScreen.tsx`   |
| BusinessesNearMe     | BusinessesNearMeScreen  | `src/screens/app/BusinessesNearMeScreen.tsx` |
| AdminHub             | AdminHubScreen            | `src/screens/app/AdminHubScreen.tsx`         |
| AdminModeration      | AdminModerationScreen     | `src/screens/app/AdminModerationScreen.tsx`  |
| AdminOperations      | AdminOperationsScreen     | `src/screens/app/AdminOperationsScreen.tsx`  |
| AdminAnalytics       | AdminAnalyticsScreen      | `src/screens/app/AdminAnalyticsScreen.tsx`   |
| AdminTables          | AdminTablesScreen         | `src/screens/app/AdminTablesScreen.tsx`      |

Admin routes are only mounted when `canAccessAdmin` is true.

### Bottom tabs (`AppTabs` → `Tab.Navigator`)

| Tab route       | Component            | File                                         |
| --------------- | -------------------- | -------------------------------------------- |
| HomeTab         | FeedScreen           | `src/screens/app/FeedScreen.tsx`             |
| MarketplaceTab  | MarketplaceFeedScreen| `src/screens/app/MarketplaceFeedScreen.tsx`  |
| MessagesTab     | MessagesScreen       | `src/screens/app/MessagesScreen.tsx`         |
| CreateTab       | CreateTabFlow        | nested stack below                           |
| AccountTab      | ProfileScreen        | `src/screens/app/ProfileScreen.tsx`          |

### Create tab nested stack

| Route      | Component       | File                                  |
| ---------- | --------------- | ------------------------------------- |
| CreateHub  | CreateHubScreen | `src/screens/app/CreateHubScreen.tsx` |
| CreatePost | CreateScreen    | `src/screens/app/CreateScreen.tsx`    |

### Screen files vs registration

All files under `src/screens/` except removed orphans are either registered above or reachable only through navigation from registered screens (same bundle). Previously **unregistered**: `ReflectLaterScreen.tsx` (removed; was never wired in `AppNavigator`).

## Phase 2 — Navigation graph (primary `navigation.navigate` / `replace`)

| Source file                 | Targets (route names) |
| --------------------------- | ----------------------- |
| WelcomeScreen               | Login, Signup           |
| LoginScreen                 | Signup                  |
| SignupScreen                | Login                   |
| FeedScreen                  | BusinessesNearMe, CreatorEconomy, HomeTab, EventDetail, UserProfile, ProductDetail, PostDetail, MessagesTab, CreateTab+CreateHub; `parent?.navigate`: Notifications, Search, Reels |
| CreateHubScreen             | CreatePost, CreateProduct, CreateEvent |
| NavigateAppScreen           | Search, AppTabs+tab     |
| AddBusinessScreen           | BusinessDetail          |
| NotificationsScreen         | EventDetail, PromotePost |
| CreateProductScreen         | CreateProduct (self edit) |
| BoostCheckoutReturnScreen   | replace → PromotePost   |
| BusinessPersonalizerOverlay | Onboarding              |
| BusinessesNearMeScreen      | AddBusiness, BusinessDetail |
| SearchScreen                | AddBusiness, UserProfile, PostDetail, BusinessDetail, EventDetail |
| CreatorEconomyScreen        | CreateProduct, PromotePost, PlaidLink |
| AdminHubScreen              | AdminModeration, AdminOperations, AdminAnalytics, AdminTables |
| SettingsScreen              | NavigateApp, EditProfile, Purchases, CreatorEconomy, CreateProduct, Onboarding, Sessions, Notifications, Dhikr, QuranReader, SalahSettings, Beta, Support, Guidelines, AdminHub |
| UserProfileScreen           | AppTabs+MessagesTab, PostDetail, ProductDetail |
| ReelsScreen                 | AppTabs+CreateTab       |
| ProductDetailScreen         | UserProfile             |
| PostDetailScreen            | UserProfile, ProductDetail |
| BusinessDetailScreen        | ProductDetail           |
| ProfileScreen               | CreateTab+CreateHub, Settings, EditProfile, AddBusiness, PostDetail, ProductDetail |
| MessagesScreen              | Search, MarketplaceTab  |
| CreateEventScreen           | replace → EventDetail   |
| CreateScreen                | PostDetail              |

## Deep linking (`linking` config)

- **Authed**: `AppTabs` → `""`, `PostDetail` → `posts/:id`, `UserProfile` → `users/:id`, `PromotePost` → `creator/promote`, `BoostCheckoutReturn` → `checkout/:step`, `EventDetail` → `events/:id` (+ invite token parse).
- **Guest**: `Welcome`, `Login`, `Signup`, `EventDetail` as above.

Do not remove duplicate `EventDetail` guest/authed registrations without re-testing universal links.

## Phase 3–5 — Orphans removed

- **ReflectLaterScreen**: Not imported in `AppNavigator`; typings referenced non-existent `ReflectTab`. **Removed** (file deleted).

**Needs product decision (not removed)**: NavigateApp, Beta, admin stack, monetization/Reels/Quran flows—all referenced from Settings or other live screens.

## Phase 4 — Tooling

Run after each cleanup chunk:

```bash
cd mobile && npm run typecheck && npm run lint
```

Optional unused-export pass (manual review; RN has false positives):

```bash
cd mobile && npm run inventory:ts-prune
```

(`inventory:ts-prune` runs `npx ts-prune` with [`tsconfig.json`](../tsconfig.json).)

## Phase 6 — Assets (`mobile/assets/`)

Files: `icon.png`, `splash-icon.png`, `favicon.png`, `android-icon-background.png`, `android-icon-foreground.png`, `android-icon-monochrome.png`. All are referenced from [`app.json`](../app.json) (icon, splash, web favicon, Android adaptive icon). **No unreferenced asset files** to remove.

## Phase 7 — Tab param list

`AppTabParamList` is aligned to the five registered tab routes only (`HomeTab`, `MarketplaceTab`, `MessagesTab`, `CreateTab`, `AccountTab`). Stale keys `FeedTab`, `ReflectTab`, `InboxTab`, `ProfileTab` were removed from the type map.
