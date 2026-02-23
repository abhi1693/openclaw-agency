import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import HelloPage from "./page";
import { QueryProvider } from "@/components/providers/QueryProvider";

vi.mock("@/api/generated/hello/hello", () => ({
  useGetHelloApiV1HelloGet: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/hello",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/link", () => {
  type LinkProps = React.PropsWithChildren<{
    href: string | { pathname?: string };
  }> &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

  return {
    default: ({ href, children, ...props }: LinkProps) => (
      <a href={typeof href === "string" ? href : "#"} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SignedIn: () => {
    throw new Error("SignedIn rendered unexpectedly");
  },
  SignedOut: () => {
    throw new Error("SignedOut rendered unexpectedly");
  },
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SignOutButton: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}));

import { useGetHelloApiV1HelloGet } from "@/api/generated/hello/hello";

const mockUseGetHelloApiV1HelloGet = useGetHelloApiV1HelloGet as ReturnType<
  typeof vi.fn
>;

describe("/hello page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    mockUseGetHelloApiV1HelloGet.mockReturnValue({
      isLoading: true,
      error: null,
      data: undefined,
    });

    render(
      <QueryProvider>
        <HelloPage />
      </QueryProvider>,
    );

    expect(screen.getByText(/loading greeting message/i)).toBeInTheDocument();
  });

  it("renders error state when API fails", () => {
    mockUseGetHelloApiV1HelloGet.mockReturnValue({
      isLoading: false,
      error: new Error("Failed to fetch"),
      data: undefined,
    });

    render(
      <QueryProvider>
        <HelloPage />
      </QueryProvider>,
    );

    expect(screen.getByText(/error loading greeting/i)).toBeInTheDocument();
    expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument();
  });

  it("renders message when API succeeds", () => {
    mockUseGetHelloApiV1HelloGet.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        status: 200,
        data: { message: "Hello, World!" },
      },
    } as unknown as ReturnType<typeof useGetHelloApiV1HelloGet>);

    render(
      <QueryProvider>
        <HelloPage />
      </QueryProvider>,
    );

    expect(screen.getByText("Hello, World!")).toBeInTheDocument();
  });
});
