import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/lib/i18n";
import { ActivityFeed } from "./ActivityFeed";

type Item = { id: string; label: string };

const renderWithLocale = (ui: React.ReactElement) =>
  render(<LocaleProvider>{ui}</LocaleProvider>);

describe("ActivityFeed", () => {
  it("renders loading state when loading and no items", () => {
    renderWithLocale(
      <ActivityFeed<Item>
        isLoading={true}
        errorMessage={null}
        items={[]}
        renderItem={(item) => <div key={item.id}>{item.label}</div>}
      />,
    );

    expect(screen.getByText("Loading feed…")).toBeInTheDocument();
  });

  it("renders error state", () => {
    renderWithLocale(
      <ActivityFeed<Item>
        isLoading={false}
        errorMessage={"Boom"}
        items={[]}
        renderItem={(item) => <div key={item.id}>{item.label}</div>}
      />,
    );

    expect(screen.getByText("Boom")).toBeInTheDocument();
  });

  it("renders default error message when errorMessage is empty", () => {
    renderWithLocale(
      <ActivityFeed<Item>
        isLoading={false}
        errorMessage={""}
        items={[]}
        renderItem={(item) => <div key={item.id}>{item.label}</div>}
      />,
    );

    expect(screen.getByText("Unable to load feed.")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    renderWithLocale(
      <ActivityFeed<Item>
        isLoading={false}
        errorMessage={null}
        items={[]}
        renderItem={(item) => <div key={item.id}>{item.label}</div>}
      />,
    );

    expect(screen.getByText("Waiting for new activity…")).toBeInTheDocument();
    expect(
      screen.getByText("When updates happen, they will show up here."),
    ).toBeInTheDocument();
  });

  it("renders items", () => {
    const items: Item[] = [
      { id: "1", label: "First" },
      { id: "2", label: "Second" },
    ];

    renderWithLocale(
      <ActivityFeed<Item>
        isLoading={false}
        errorMessage={null}
        items={items}
        renderItem={(item) => (
          <div key={item.id} data-testid="feed-item">
            {item.label}
          </div>
        )}
      />,
    );

    expect(screen.getAllByTestId("feed-item")).toHaveLength(2);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
