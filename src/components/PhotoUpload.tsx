"use client";

import { useState, useRef } from "react";
import { Amplify } from "aws-amplify";
import { uploadData } from "aws-amplify/storage";
import { getCurrentUser } from "aws-amplify/auth";
import { v4 as uuidv4 } from "uuid";
import awsconfig from "../aws-exports";

// Amplifyの設定
Amplify.configure(awsconfig);

interface PhotoUploadProps {
  onUploadSuccess: () => void;
  userInfo: { passcode: string; name: string } | null;
}

export default function PhotoUpload({ onUploadSuccess, userInfo }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file);
    } else {
      alert("画像ファイルを選択してください");
    }
  };

  const animateButton = () => {
    if (buttonRef.current) {
      // アニメーションクラスをリセット
      buttonRef.current.classList.remove("animate");

      // 少し遅らせてからアニメーションクラスを追加
      requestAnimationFrame(() => {
        if (buttonRef.current) {
          buttonRef.current.classList.add("animate");
          setTimeout(() => {
            if (buttonRef.current) {
              buttonRef.current.classList.remove("animate");
            }
          }, 700);
        }
      });
    }
  };

  const handleUpload = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!selectedFile || !userInfo) return;

    // バブリーアニメーションを開始
    animateButton();

    setUploading(true);
    try {
      const user = await getCurrentUser();
      const photoId = uuidv4();
      const fileKey = `photos/${photoId}-${selectedFile.name}`;

      // S3にファイルをアップロード（metadataから日本語文字を除去）
      const result = await uploadData({
        key: fileKey,
        data: selectedFile,
        options: {
          metadata: {
            uploadedBy: user.username,
            uploadedAt: new Date().toISOString(),
            photoId: photoId,
          },
        },
      }).result;

      console.log("S3 upload successful:", result);

      // DynamoDBに写真メタデータを保存（日本語文字はここで保存）
      const response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/photos/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          photoId: photoId,
          uploadedBy: user.username,
          caption: caption,
          s3Key: fileKey,
          uploaderName: userInfo.name,
        }),
      });

      const saveResult = await response.json();

      if (!saveResult.success) {
        throw new Error(saveResult.message || "Failed to save photo metadata");
      }

      console.log("Photo metadata saved successfully");

      // Reset form
      setSelectedFile(null);
      setCaption("");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      onUploadSuccess();
      alert("写真をアップロードしました！");
    } catch (error) {
      console.error("Upload error:", error);
      alert("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* バブリーボタン用CSS */}
      <style jsx>{`
        .bubbly-button {
          font-family: "Helvetica", "Arial", sans-serif;
          display: inline-block;
          font-size: 1em;
          padding: 1em 2em;
          -webkit-appearance: none;
          appearance: none;
          background-color: #ff0081;
          color: #fff;
          border-radius: 16px;
          border: none;
          cursor: pointer;
          position: relative;
          transition: transform ease-in 0.1s, box-shadow ease-in 0.25s;
          box-shadow: 0 2px 25px rgba(255, 0, 130, 0.5);
          width: 100%;
          font-weight: bold;
        }

        .bubbly-button:focus {
          outline: 0;
        }

        .bubbly-button:before,
        .bubbly-button:after {
          position: absolute;
          content: "";
          display: block;
          width: 140%;
          height: 100%;
          left: -20%;
          z-index: -1000;
          transition: all ease-in-out 0.5s;
          background-repeat: no-repeat;
        }

        .bubbly-button:before {
          display: none;
          top: -75%;
          background-image: radial-gradient(circle, #ff0081 20%, transparent 20%), radial-gradient(circle, transparent 20%, #ff0081 20%, transparent 30%),
            radial-gradient(circle, #ff0081 20%, transparent 20%), radial-gradient(circle, #ff0081 20%, transparent 20%),
            radial-gradient(circle, transparent 10%, #ff0081 15%, transparent 20%), radial-gradient(circle, #ff0081 20%, transparent 20%),
            radial-gradient(circle, #ff0081 20%, transparent 20%), radial-gradient(circle, #ff0081 20%, transparent 20%),
            radial-gradient(circle, #ff0081 20%, transparent 20%);
          background-size: 10% 10%, 20% 20%, 15% 15%, 20% 20%, 18% 18%, 10% 10%, 15% 15%, 10% 10%, 18% 18%;
        }

        .bubbly-button:after {
          display: none;
          bottom: -75%;
          background-image: radial-gradient(circle, #ff0081 20%, transparent 20%), radial-gradient(circle, #ff0081 20%, transparent 20%),
            radial-gradient(circle, transparent 10%, #ff0081 15%, transparent 20%), radial-gradient(circle, #ff0081 20%, transparent 20%),
            radial-gradient(circle, #ff0081 20%, transparent 20%), radial-gradient(circle, #ff0081 20%, transparent 20%),
            radial-gradient(circle, #ff0081 20%, transparent 20%);
          background-size: 15% 15%, 20% 20%, 18% 18%, 20% 20%, 15% 15%, 10% 10%, 20% 20%;
        }

        .bubbly-button:active {
          transform: scale(0.9);
          background-color: #e6007a;
          box-shadow: 0 2px 25px rgba(255, 0, 130, 0.2);
        }

        .bubbly-button:disabled {
          background-color: #d1d5db;
          color: #6b7280;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .bubbly-button:disabled:before,
        .bubbly-button:disabled:after {
          display: none;
        }

        .bubbly-button.animate:before {
          display: block;
          animation: topBubbles ease-in-out 0.75s forwards;
        }

        .bubbly-button.animate:after {
          display: block;
          animation: bottomBubbles ease-in-out 0.75s forwards;
        }

        @keyframes topBubbles {
          0% {
            background-position: 5% 90%, 10% 90%, 10% 90%, 15% 90%, 25% 90%, 25% 90%, 40% 90%, 55% 90%, 70% 90%;
          }
          50% {
            background-position: 0% 80%, 0% 20%, 10% 40%, 20% 0%, 30% 30%, 22% 50%, 50% 50%, 65% 20%, 90% 30%;
          }
          100% {
            background-position: 0% 70%, 0% 10%, 10% 30%, 20% -10%, 30% 20%, 22% 40%, 50% 40%, 65% 10%, 90% 20%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }
        }

        @keyframes bottomBubbles {
          0% {
            background-position: 10% -10%, 30% 10%, 55% -10%, 70% -10%, 85% -10%, 70% -10%, 70% 0%;
          }
          50% {
            background-position: 0% 80%, 20% 80%, 45% 60%, 60% 100%, 75% 70%, 95% 60%, 105% 0%;
          }
          100% {
            background-position: 0% 90%, 20% 90%, 45% 70%, 60% 110%, 75% 80%, 95% 70%, 110% 10%;
            background-size: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }
        }
      `}</style>

      <div className="space-y-6">
        {/* ファイル選択エリア */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">写真を選択</label>

          {!selectedFile ? (
            <label
              htmlFor="file-input"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-pink-300 rounded-2xl cursor-pointer bg-pink-50/50 hover:bg-pink-50 transition-colors"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-8 h-8 mb-2 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <p className="text-sm text-pink-600 font-medium">写真をタップして選択</p>
                <p className="text-xs text-gray-500">JPG, PNG, GIF</p>
              </div>
              <input id="file-input" type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            </label>
          ) : (
            <div className="relative">
              <img src={URL.createObjectURL(selectedFile)} alt="Preview" className="w-full h-64 object-cover rounded-2xl" />
              <button
                onClick={() => {
                  setSelectedFile(null);
                  const fileInput = document.getElementById("file-input") as HTMLInputElement;
                  if (fileInput) fileInput.value = "";
                }}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm rounded-lg px-2 py-1">
                <p className="text-white text-xs">{selectedFile.name}</p>
              </div>
            </div>
          )}
        </div>

        {/* キャプション入力 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">コメント（任意）</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all duration-200 bg-gray-50/50 resize-none"
            placeholder="この写真について一言..."
            disabled={uploading}
          />
        </div>

        {/* バブリーアップロードボタン */}
        <button ref={buttonRef} onClick={handleUpload} disabled={!selectedFile || uploading} className="bubbly-button">
          {uploading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>アップロード中...</span>
            </div>
          ) : (
            "写真をアップロード"
          )}
        </button>
      </div>
    </>
  );
}
