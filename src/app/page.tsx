"use client";

import { useState, useEffect } from "react";
import { Amplify } from "aws-amplify";
import { getCurrentUser, signOut, AuthUser } from "aws-amplify/auth";
import { get, post } from "aws-amplify/api";
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
      console.log("2. DynamoDB check completed");
    }
  };

  const handleUserRegistration = async (name: string) => {
    if (!user) return;

    try {
      const restOperation = post({
        apiName: "weddingAPI",
        path: "/photos/user",
        options: {
          body: {
            passcode: user.username,
            name: name,
          },
        },
      });

      const response = await restOperation.response;
      const rawData = await response.body.json();
      const data = rawData as unknown as { success: boolean };

      if (data.success) {
        setUserInfo({
          passcode: user.username,
          name: name,
        });
        alert("ユーザー情報を登録しました！");
      } else {
        alert("登録に失敗しました");
      }
    } catch (error) {
      console.error("Error registering user:", error);
      alert("登録に失敗しました");
    }
  };

  const handleAuthSuccess = async () => {
    console.log("=== Auth success callback ===");
    // CustomAuthからのコールバック後、再度checkUserを実行
    await checkUser();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setUserInfo(null);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    // 写真一覧を更新するためにrefreshTriggerを変更
    setRefreshTrigger((prev) => prev + 1);
  };

  // ログ出力：現在の状態
  console.log("=== Current State ===");
  console.log("loading:", loading);
  console.log("userInfoLoading:", userInfoLoading);
  console.log("user:", user ? "exists" : "null");
  console.log("userInfo:", userInfo);

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

  // 2. 未認証の場合
  if (!user) {
    console.log("3. Display: Login screen");
    return <CustomAuth onAuthSuccess={handleAuthSuccess} />;
  }

  // 3. ユーザー情報取得中
  if (userInfoLoading) {
    console.log("3. Display: User info loading screen");
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-rose-50 to-purple-50">
        <div className="text-center">
          <div className="inline-block p-4 bg-white rounded-full shadow-lg mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-purple-400 rounded-full animate-pulse"></div>
          </div>
          <div className="text-xl text-gray-700">ユーザー情報を確認中...</div>
        </div>
      </div>
    );
  }

  // 4. 認証済みだがユーザー情報未登録の場合（モーダル表示）
  if (!userInfo || !userInfo.name) {
    console.log("3. Display: Modal for registration");
    return (
      <>
        {/* バックグラウンドのメイン画面 */}
        <div className="min-h-screen bg-gradient-to-br from-rose-50 to-purple-50">
          {/* ヘッダー */}
          <header className="bg-white/80 backdrop-blur-md border-b border-pink-100 sticky top-0 z-10">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-purple-400 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">Wedding Memories</h1>
                </div>
                <div className="text-xs text-gray-500">登録が必要です</div>
              </div>
            </div>
          </header>

          {/* メインコンテンツ */}
          <main className="pb-20">
            <PhotoGallery refreshTrigger={refreshTrigger} />
          </main>
        </div>

        <UserRegistrationModal passcode={user.username} onRegister={handleUserRegistration} onLogout={handleSignOut} />
      </>
    );
  }

  // 5. 正常にユーザー情報が取得できた場合
  console.log("3. Display: Main app with user name:", userInfo.name);
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-purple-50">
      {/* ヘッダー */}
      <header className="bg-white/80 backdrop-blur-md border-b border-pink-100 sticky top-0 z-40">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-purple-400 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">Wedding Memories</h1>
                <p className="text-xs text-gray-600">ようこそ {userInfo.name}さん</p>
              </div>
            </div>

            <button onClick={handleSignOut} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
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
        <PhotoGallery refreshTrigger={refreshTrigger} />
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
          <div className="bg-white/95 backdrop-blur-md rounded-2xl w-full max-w-md shadow-2xl border border-white/30">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">写真をアップロード</h2>
                <button onClick={() => setShowUploadModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <PhotoUpload onUploadSuccess={handleUploadSuccess} userInfo={userInfo} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
