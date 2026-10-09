import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./components/providers";

export const metadata: Metadata = {
  title: "Sentry 2.0: Smart Transaction Stack",
  description:
    "Autonomous Solana transaction routing through Solami Beam with dynamic Jito tips, live lifecycle observability, and Groq-powered AI decision traces.",
  icons: {
    icon: "/favicon/favicon.ico",
    shortcut: "/favicon/favicon-16x16.png",
    apple: "/favicon/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function isExtensionError(err, filename) {
                  var msg = (err && err.message) || String(err || '');
                  var stack = (err && err.stack) || '';
                  var file = filename || '';
                  return (
                    file.indexOf('chrome-extension://') !== -1 ||
                    file.indexOf('moz-extension://') !== -1 ||
                    stack.indexOf('chrome-extension://') !== -1 ||
                    stack.indexOf('moz-extension://') !== -1 ||
                    msg.indexOf('Could not establish connection') !== -1 ||
                    msg.indexOf('Receiving end does not exist') !== -1
                  );
                }
                window.addEventListener('error', function(e) {
                  if (isExtensionError(e.error || e.message, e.filename)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  if (isExtensionError(e.reason)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                  }
                }, true);
              })();
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:ital,wght@0,400..800;1,400..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <Providers>
        <body
          suppressHydrationWarning
          className="antialiased font-serif bg-[#F7F4EC] text-[#121212]"
        >
          {children}
        </body>
      </Providers>
    </html>
  );
}
