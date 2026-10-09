"use client";

import { SolanaProvider } from "@solana/react-hooks";
import { PropsWithChildren, useEffect } from "react";
import { autoDiscover, createClient } from "@solana/client";

// Suppress unhandled errors from browser extensions (e.g. Phantom, Keplr, MetaMask)
if (typeof window !== "undefined") {
  const isExtensionError = (err: unknown, filename?: string) => {
    const msg = typeof err === "string" ? err : (err as { message?: string })?.message || "";
    const stack = (err as { stack?: string })?.stack || "";
    const file = filename || "";
    return (
      file.includes("chrome-extension://") ||
      file.includes("moz-extension://") ||
      stack.includes("chrome-extension://") ||
      stack.includes("moz-extension://") ||
      msg.includes("Could not establish connection") ||
      msg.includes("Receiving end does not exist")
    );
  };

  window.addEventListener(
    "error",
    (event: ErrorEvent) => {
      if (isExtensionError(event.error || event.message, event.filename)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      if (isExtensionError(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

// NEXT_PUBLIC_RPC_URL is set at build time. The server-side SOLANA_RPC_URL
// cannot be read by the browser, so we expose it separately.
const endpoint =
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.mainnet-beta.solana.com";

const client = createClient({
  endpoint,
  walletConnectors: autoDiscover(),
});

export function Providers({ children }: PropsWithChildren) {
  useEffect(() => {
    const isExtensionError = (err: unknown, filename?: string) => {
      const msg = typeof err === "string" ? err : (err as { message?: string })?.message || "";
      const stack = (err as { stack?: string })?.stack || "";
      const file = filename || "";
      return (
        file.includes("chrome-extension://") ||
        file.includes("moz-extension://") ||
        stack.includes("chrome-extension://") ||
        stack.includes("moz-extension://") ||
        msg.includes("Could not establish connection") ||
        msg.includes("Receiving end does not exist")
      );
    };

    const onError = (e: ErrorEvent) => {
      if (isExtensionError(e.error || e.message, e.filename)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      if (isExtensionError(e.reason)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection, true);

    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection, true);
    };
  }, []);

  return <SolanaProvider client={client}>{children}</SolanaProvider>;
}
