import "@testing-library/jest-native/extend-expect";

jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[x]" })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: { DEFAULT: 3 }
}));

jest.mock("react-native-maps", () => {
  // CommonJS mock factory — require matches Metro’s RN resolution in Jest.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest mock factory
  const { View } = require("react-native");
  const Mock = View;
  return {
    __esModule: true,
    default: Mock,
    Marker: Mock,
    Callout: Mock,
    PROVIDER_DEFAULT: "default"
  };
});
