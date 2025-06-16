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
  const [refreshTrigger, setRefreshTrigger] = useState(0); // 写真一覧の更新用

  const checkUser = async () => {
    console.log("=== Starting checkUser ===");
    try {
      const currentUser = await getCurrentUser();
      console.log("1. Cognito authentication check - Current user:", currentUser);

      setUser(currentUser);

      // 2. DynamoDBでnameカラムチェック
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
    setRefreshTrigger((prev) => prev + 1);
  };

  // 読み込み中
  // 1. 初期ローディング中
  if (loading) {
    console.log("3. Display: Initial loading screen");
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

  // 未認証（ログイン画面）
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

  // 名前未登録（ユーザー登録モーダル）
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
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
      {/* ヘッダー */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-pink-100 sticky top-0 z-20">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">Wedding Photos</h1>
            <p className="text-sm text-gray-600">
              こんにちは、<span className="font-medium text-pink-600">{userInfo.name}</span>さん
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
      <main className="pb-20">
        <PhotoGallery refreshTrigger={refreshTrigger} userInfo={userInfo} />
      </main>

      {/* 固定投稿ボタン */}
      <button
        onClick={() => setShowUploadModal(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
      >
        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* アップロードモーダル */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl w-full max-w-md shadow-2xl border border-white/30 h-[80vh] flex flex-col">
            {/* ヘッダー - 固定 */}
            <div className="flex-shrink-0 p-6 pb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">写真をアップロード</h2>
                <button onClick={() => setShowUploadModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* コンテンツエリア - スクロール可能、完全固定高さ */}
            <div className="flex-1 min-h-0 px-6 pb-6 overflow-y-auto">
              <PhotoUpload onUploadSuccess={handleUploadSuccess} userInfo={userInfo} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
