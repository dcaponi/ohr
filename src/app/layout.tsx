import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ohr — RAG Q&A",
  description: "Retrieval Q&A over arxiv papers, lab SOPs, and shark facts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <span className="brand">ohr</span>
          <Link href="/">Ask</Link>
          <Link href="/drive">Drive</Link>
          <Link href="/evals">Evals</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
