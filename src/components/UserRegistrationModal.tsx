"use client";

import { useState } from "react";
import { Amplify } from "aws-amplify";
import { post } from "aws-amplify/api";
import awsconfig from "../aws-exports";
import { useLanguage } from "@/contexts/LanguageContext";

// Amplifyの設定
Amplify.configure(awsconfig);

interface UserRegistrationModalProps {
  passcode: string;
  onRegister: (name: string) => void;
  onLogout: () => void;
}

interface ApiResponse {
  success: boolean;
  message?: string;
}

export default function UserRegistrationModal({ passcode, onRegister, onLogout }: UserRegistrationModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { t, language } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert(t("enter_name"));
      return;
    }

    setLoading(true);
    try {
      // DynamoDBにユーザー情報を保存
      const restOperation = post({
        apiName: "weddingAPI",
        path: "/photos/user",
        options: {
          body: {
            passcode: passcode,
            name: name.trim(),
          },
        },
      });

      const response = await restOperation.response;
      const data = (await response.body.json()) as unknown as ApiResponse;

      if (data.success) {
        console.log("✅ User registration successful");
        // 登録成功時にonRegisterを呼び出し
        await onRegister(name.trim());
      } else {
        throw new Error(data.message || "User registration failed");
      }
    } catch (error) {
      console.error("Error registering user:", error);
      alert(t("registration_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-8 w-full max-w-md shadow-2xl border border-white/30">
        <div className="mb-8">
          <div className="text-center mb-4">
            <div className="inline-block p-3 bg-gradient-to-br from-pink-400 to-purple-400 rounded-full mb-4">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent mb-2">{t("user_registration")}</h2>
          </div>
          <div className="text-center bg-pink-50 rounded-xl p-4 border border-pink-100">
            <p className="text-gray-700 text-sm">
              {language === "ja" ? (
                <>
                  招待コード「<span className="font-bold text-pink-600">{passcode}</span>」
                  <br />
                  {t("logged_in_with_code")}
                </>
              ) : (
                <>
                  {t("logged_in_with_code")} with code <span className="font-bold text-pink-600">{passcode}</span>
                </>
              )}
            </p>
            <p className="text-gray-600 text-sm mt-2 whitespace-pre-line">{t("register_name_start")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              {t("name")} <span className="text-red-500">{t("required")}</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("name_example")}
                className="w-full px-4 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all duration-200 bg-gray-50/50"
                required
                autoFocus
                disabled={loading}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onLogout}
              className="flex-1 py-4 px-6 border-2 border-gray-300 rounded-2xl text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
              disabled={loading}
            >
              {t("logout")}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className={`flex-1 py-4 px-6 rounded-2xl font-bold transition-all duration-200 ${
                loading || !name.trim()
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {t("registering")}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {t("register")}
                </div>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
