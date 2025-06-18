"use client";

import { useLanguage } from "@/contexts/LanguageContext";

interface LanguageSwitcherProps {
  className?: string;
}

export default function LanguageSwitcher({ className = "" }: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();

  // 現在使用していない言語のボタンのみを表示
  return (
    <div className={`flex items-center ${className}`}>
      {language === "ja" ? (
        <button
          onClick={() => setLanguage("en")}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 bg-white/80 text-gray-600 hover:bg-white hover:text-gray-800 border border-gray-200 hover:shadow-sm"
        >
          English
        </button>
      ) : (
        <button
          onClick={() => setLanguage("ja")}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 bg-white/80 text-gray-600 hover:bg-white hover:text-gray-800 border border-gray-200 hover:shadow-sm"
        >
          日本語
        </button>
      )}
    </div>
  );
}
