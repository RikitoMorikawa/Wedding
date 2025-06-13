"use client";

import { useState } from "react";
import { signIn, SignInOutput } from "aws-amplify/auth";

interface CustomAuthProps {
  onAuthSuccess: () => void;
}

export default function CustomAuth({ onAuthSuccess }: CustomAuthProps) {
  const [passcode, setPasscode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passcode.trim() || passcode.length < 6) {
      setError("6文字のパスコードを入力してください");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      console.log("=== CustomAuth: Starting login ===");
      console.log("Attempting to sign in with passcode:", passcode);

      const result: SignInOutput = await signIn({
        username: passcode,
        password: passcode,
      });

      console.log("Sign in result:", result);

      if (result.isSignedIn) {
        console.log("✅ CustomAuth: Login successful");
        onAuthSuccess();
      } else {
        console.log("❌ CustomAuth: Login incomplete:", result.nextStep);
        setError("ログインが完了しませんでした");
      }
    } catch (error: unknown) {
      console.error("CustomAuth: Login error:", error);

      const err = error as { name?: string };
      if (err.name === "NotAuthorizedException") {
        setError("パスコードが正しくありません");
      } else if (err.name === "UserNotFoundException") {
        setError("ユーザーが見つかりません");
      } else {
        setError("ログインエラーが発生しました");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 px-4 py-8 flex flex-col justify-center">
      {/* ヘッダー部分 */}
      <div className="text-center mb-4">
        <div className="inline-block p-4 bg-white rounded-full shadow-lg mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-purple-400 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">Wedding Memories</h1>
        <p className="text-gray-600 text-lg">結婚式写真共有</p>
      </div>

      {/* フォーム部分 */}
      <div className="max-w-sm mx-auto w-full">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl p-8 border border-white/20">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="passcode" className="block text-sm font-semibold text-gray-700 mb-3">
                招待コード
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="passcode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full px-4 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all duration-200 bg-gray-50/50"
                  placeholder="招待コードを入力"
                  required
                  disabled={isLoading}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm text-center">
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {error}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || passcode.length < 6}
              className={`w-full font-bold py-4 px-6 rounded-2xl transition-all duration-200 shadow-lg ${
                isLoading || passcode.length < 6
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-50"
                  : "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white hover:shadow-xl transform hover:-translate-y-0.5"
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  ログイン中...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                    />
                  </svg>
                  ログイン
                </div>
              )}
            </button>
          </form>
        </div>

        {/* フッター */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            特別な日の思い出を
            <br />
            みんなで共有しましょう 💕
          </p>
        </div>
      </div>
    </div>
  );
}
