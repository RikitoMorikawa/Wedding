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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">読み込み中...</div>
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">ユーザー情報を確認中...</div>
      </div>
    );
  }

  // 4. 認証済みだがユーザー情報未登録の場合（モーダル表示）
  if (!userInfo || !userInfo.name) {
    console.log("3. Display: Modal for registration");
    return (
      <>
        <main className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-center">結婚式写真共有</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">登録が必要です</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <PhotoUpload onUploadSuccess={() => window.location.reload()} />
            </div>
            <div className="lg:col-span-2">
              <PhotoGallery />
            </div>
          </div>
        </main>

        <UserRegistrationModal passcode={user.username} onRegister={handleUserRegistration} onLogout={handleSignOut} />
      </>
    );
  }

  // 5. 正常にユーザー情報が取得できた場合
  console.log("3. Display: Main app with user name:", userInfo.name);
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-center">結婚式写真共有</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">ようこそ「{userInfo.name}」さん</span>
          <button onClick={handleSignOut} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
            ログアウト
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <PhotoUpload onUploadSuccess={() => window.location.reload()} />
        </div>
        <div className="lg:col-span-2">
          <PhotoGallery />
        </div>
      </div>
    </main>
  );
}
