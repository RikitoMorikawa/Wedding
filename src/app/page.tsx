"use client";

import { useState, useEffect } from "react";
import { Amplify } from "aws-amplify";
import { getCurrentUser, signOut, AuthUser } from "aws-amplify/auth";
import { get } from "aws-amplify/api";
import awsconfig from "../aws-exports";
import CustomAuth from "@/components/CustomAuth";
import PhotoGallery from "@/components/PhotoGallery";
import PhotoUpload from "@/components/PhotoUpload";
import UserRegistrationModal from "@/components/UserRegistrationModal";

// Amplifyの設定を確実に行う
Amplify.configure(awsconfig);

// 型定義を追加
type MediaType = "photo" | "video";

interface UserInfo {
  passcode: string;
  name: string;
}

interface ApiResponse {
  success: boolean;
  user?: UserInfo;
  message?: string;
}

export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [userInfoLoading, setUserInfoLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showMediaSelector, setShowMediaSelector] = useState(false); // メディア選択の表示状態
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType>("photo");

  // 既存の関数群（checkUser, fetchUserInfo, handleLogout等）は同じなので省略...
  const checkUser = async () => {
    console.log("=== Starting checkUser ===");
    try {
      const currentUser = await getCurrentUser();
      console.log("1. Cognito authentication check - Current user:", currentUser);
      setUser(currentUser);
      await fetchUserInfo(currentUser.username);
    } catch (error) {
      console.log("User not authenticated:", error);
      setUser(null);
      setUserInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkUser();
  }, []);

  const fetchUserInfo = async (passcode: string) => {
    console.log("2. DynamoDB name column check - Starting for passcode:", passcode);
    if (!passcode) {
      console.error("Passcode is undefined, skipping fetch");
      return;
    }
    setUserInfoLoading(true);
    try {
      const restOperation = get({
        apiName: "weddingAPI",
        path: `/photos/user/${passcode}`,
      });
      const response = await restOperation.response;
      const rawData = await response.body.json();
      const data = rawData as unknown as ApiResponse;
      console.log("DynamoDB API Response:", data);
      if (data.success && data.user && data.user.name) {
        console.log("✅ User found with name:", data.user.name);
        setUserInfo(data.user);
      } else {
        console.log("❌ User not found or no name");
        setUserInfo(null);
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
      setUserInfo(null);
    } finally {
      setUserInfoLoading(false);
      console.log("2. DynamoDB name column check - Completed");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setUser(null);
      setUserInfo(null);
      window.location.reload();
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    setShowMediaSelector(false);
    setRefreshTrigger((prev) => prev + 1);
  };

  // 投稿ボタンクリック時の処理
  const handlePostButtonClick = () => {
    setShowMediaSelector(!showMediaSelector);
  };

  // メディアタイプ選択時の処理
  const handleMediaTypeSelect = (mediaType: MediaType) => {
    setSelectedMediaType(mediaType);
    setShowMediaSelector(false);
    setShowUploadModal(true);
  };

  // 初期ローディング
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-rose-50 to-purple-50">
        <div className="text-center">
          <div className="inline-block p-4 bg-white rounded-full shadow-lg mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-purple-400 rounded-full animate-pulse"></div>
          </div>
          <div className="text-xl text-gray-700">読み込み中...</div>
        </div>
      </div>
    );
  }

  // 未認証
  if (!user) {
    return <CustomAuth onAuthSuccess={checkUser} />;
  }

  // ユーザー情報取得中
  if (userInfoLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-300 border-t-pink-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">ユーザー情報を確認中...</p>
        </div>
      </div>
    );
  }

  // 名前未登録
  if (!userInfo?.name) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <UserRegistrationModal
          passcode={user.username}
          onRegister={(name: string) => {
            setUserInfo({
              passcode: user.username,
              name: name,
            });
          }}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  // メイン画面
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-purple-50">
      {/* ヘッダー */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-pink-100 sticky top-0 z-20">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">Wedding Photos</h1>
            <p className="text-sm text-gray-600">
              こんにちは、<span className="font-medium text-pink-600">{userInfo?.name}</span>さん
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={handleLogout} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="pb-32">
        <PhotoGallery refreshTrigger={refreshTrigger} userInfo={userInfo} />
      </main>

      {/* 固定投稿エリア */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end space-y-3">
        {/* メディア選択オプション（展開時のみ表示） */}
        {showMediaSelector && (
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-2 transform transition-all duration-300 ease-out animate-in slide-in-from-bottom-2">
            <div className="flex flex-col space-y-2">
              {/* 写真選択ボタン */}
              <button
                onClick={() => handleMediaTypeSelect("photo")}
                className="flex items-center space-x-3 p-3 rounded-xl hover:bg-pink-50 transition-colors group"
              >
                <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="font-semibold text-gray-800">📷 写真</div>
                  <div className="text-xs text-gray-500">JPG, PNG, GIF</div>
                </div>
              </button>

              {/* 動画選択ボタン */}
              <button
                onClick={() => handleMediaTypeSelect("video")}
                className="flex items-center space-x-3 p-3 rounded-xl hover:bg-purple-50 transition-colors group"
              >
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="font-semibold text-gray-800">🎥 動画</div>
                  <div className="text-xs text-gray-500">MP4, MOV, AVI</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* 投稿ボタン */}
        <button
          onClick={handlePostButtonClick}
          className={`w-14 h-14 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 ${
            showMediaSelector ? "rotate-45" : ""
          }`}
          title="投稿する"
        >
          <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* アップロードモーダル */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl w-full max-w-md shadow-2xl border border-white/30 h-[80vh] flex flex-col">
            {/* ヘッダー - 固定 */}
            <div className="flex-shrink-0 p-6 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{selectedMediaType === "photo" ? "📷" : "🎥"}</span>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                    {selectedMediaType === "photo" ? "写真" : "動画"}をアップロード
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setShowMediaSelector(false);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* コンテンツエリア - スクロール可能 */}
            <div className="flex-1 min-h-0 px-6 pb-6 overflow-y-auto">
              <PhotoUpload onUploadSuccess={handleUploadSuccess} userInfo={userInfo} selectedMediaType={selectedMediaType} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
