import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { IntroOverlay } from "@/components/IntroOverlay";
import "./globals.css";

/**
 * 첫 페인트 전에 실행돼, 이미 인트로를 본 세션이면 오버레이를 숨긴다.
 * React가 붙기를 기다리면 인트로가 한 프레임 비쳤다 사라지는 flash가 생긴다.
 */
const INTRO_FLASH_GUARD = `try{if(sessionStorage.getItem('business-monitor-intro-seen'))document.documentElement.dataset.introSeen='1'}catch(e){}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "기업 환경 모니터링",
  description: "국내 기업 규제 관련 애로사항 기사를 매일 수집·요약합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        모바일 우선 반응형: 좁은 화면(단일 열)부터 넓은 화면(1180px, 2열)까지 대응한다.
        배경은 Google Workspace 계열의 밝은 회색(#F8F9FA)에 아주 옅은 radial gradient만
        얹어 색이 도드라지지 않게 한다.
      */}
      <body className="flex min-h-full flex-col bg-[#F8F9FA] bg-[radial-gradient(circle_at_85%_5%,rgba(66,133,244,0.10),transparent_30%),radial-gradient(circle_at_10%_0%,rgba(52,168,83,0.06),transparent_25%)] bg-fixed">
        <script dangerouslySetInnerHTML={{ __html: INTRO_FLASH_GUARD }} />
        {children}
        <IntroOverlay />
      </body>
    </html>
  );
}
