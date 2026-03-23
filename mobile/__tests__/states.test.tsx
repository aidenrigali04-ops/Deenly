import { render } from "@testing-library/react-native";
import { EmptyState, ErrorState, LoadingState } from "../src/components/States";

describe("States components", () => {
  it("renders loading and empty states", () => {
    const loading = render(<LoadingState label="Loading feed..." />);
    expect(loading.getByText("Loading feed...")).toBeTruthy();

    const empty = render(<EmptyState title="No data" subtitle="Try again later" />);
    expect(empty.getByText("No data")).toBeTruthy();
    expect(empty.getByText("Try again later")).toBeTruthy();
  });

  it("renders error state message", () => {
    const error = render(<ErrorState message="Something went wrong" />);
    expect(error.getByText("Something went wrong")).toBeTruthy();
  });
});
