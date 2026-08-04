import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "기업환경 모니터",
  description: "국내 기업 규제 관련 애로사항 기사를 매일 수집·요약합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* 모바일 우선 반응형: 좁은 화면(단일 열)부터 넓은 화면(1180px, 2열)까지 대응한다 */}
      <body className="flex min-h-full flex-col bg-slate-200">{children}</body>
    </html>
  );
}
