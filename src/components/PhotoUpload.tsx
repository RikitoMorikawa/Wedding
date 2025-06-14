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

interface SelectedFile {
  file: File;
  id: string;
  preview: string;
}

const MAX_FILES = 10;

export default function PhotoUpload({ onUploadSuccess, userInfo }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [caption, setCaption] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      alert("画像ファイルを選択してください");
      return;
    }

    if (selectedFiles.length + imageFiles.length > MAX_FILES) {
      alert(`最大${MAX_FILES}枚まで選択できます`);
      return;
    }

    const newFiles: SelectedFile[] = imageFiles.map((file) => ({
      file,
      id: uuidv4(),
      preview: URL.createObjectURL(file),
    }));

    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeAllFiles = () => {
    selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
    setSelectedFiles([]);
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const animateButton = () => {
    if (buttonRef.current) {
      buttonRef.current.classList.remove("animate");
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

    if (selectedFiles.length === 0 || !userInfo) return;

    animateButton();
    setUploading(true);

    try {
      const user = await getCurrentUser();
      const albumId = uuidv4(); // アルバムID（複数枚の場合のグループID）
      const uploadedAt = new Date().toISOString();

      // 複数の写真を順次アップロード
      const uploadPromises = selectedFiles.map(async (selectedFile, index) => {
        const photoId = uuidv4();
        const fileKey = `photos/${albumId}/${photoId}-${selectedFile.file.name}`;

        try {
          // S3にファイルをアップロード
          await uploadData({
            key: fileKey,
            data: selectedFile.file,
            options: {
              metadata: {
                uploadedBy: user.username,
                uploadedAt: uploadedAt,
                photoId: photoId,
                albumId: albumId,
                photoIndex: index.toString(),
              },
            },
          }).result;

          // DynamoDBに写真メタデータを保存
          const response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/photos/save-album`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              photoId: photoId,
              albumId: albumId,
              uploadedBy: user.username,
              caption: index === 0 ? caption : "", // 最初の写真にのみキャプションを設定
              s3Key: fileKey,
              uploaderName: userInfo.name,
              uploadedAt: uploadedAt,
              photoIndex: index,
              totalPhotos: selectedFiles.length,
              isMainPhoto: index === 0, // 最初の写真をメイン写真として設定
            }),
          });

          const saveResult = await response.json();

          if (!saveResult.success) {
            throw new Error(saveResult.message || "Failed to save photo metadata");
          }

          return { success: true, photoId, fileKey };
        } catch (error) {
          console.error(`Error uploading ${selectedFile.file.name}:`, error);
          return { success: false, error, photoId, fileKey };
        }
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      console.log(`Upload completed: ${successCount} success, ${failureCount} failures`);

      // フォームリセット
      selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
      setSelectedFiles([]);
      setCaption("");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      onUploadSuccess();

      if (failureCount === 0) {
        alert(`${successCount}枚の写真をアップロードしました！`);
      } else {
        alert(`${successCount}枚の写真をアップロードしました。${failureCount}枚は失敗しました。`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  // 総ファイルサイズを計算（MB）
  const totalFileSize = selectedFiles.reduce((sum, file) => sum + file.file.size, 0) / (1024 * 1024);

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

      <div className="space-y-6 max-h-[60vh] overflow-y-auto my-2">
        {/* ファイル選択エリア */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            写真を選択 ({selectedFiles.length}/{MAX_FILES}枚)
            {selectedFiles.length > 0 && <span className="text-xs text-gray-500 ml-2">({totalFileSize.toFixed(1)}MB)</span>}
          </label>

          <label
            htmlFor="file-input"
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-pink-300 rounded-2xl cursor-pointer bg-pink-50/50 hover:bg-pink-50 transition-colors"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-8 h-8 mb-2 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <p className="text-sm text-pink-600 font-medium">{selectedFiles.length === 0 ? "写真をタップして選択" : "写真を追加"}</p>
              <p className="text-xs text-gray-500">JPG, PNG, GIF（最大{MAX_FILES}枚）</p>
            </div>
            <input
              id="file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={selectedFiles.length >= MAX_FILES}
            />
          </label>
        </div>

        {/* 選択されたファイルの情報（プレビューなし） */}
        {selectedFiles.length > 0 && (
          <div className="bg-pink-50/50 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">選択中の写真 ({selectedFiles.length}枚)</h3>
              <button onClick={removeAllFiles} className="text-xs text-red-500 hover:text-red-700 font-medium" disabled={uploading}>
                すべて削除
              </button>
            </div>
          </div>
        )}

        {/* キャプション入力 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            コメント（任意）
            {selectedFiles.length > 1 && <span className="text-xs text-gray-500 ml-2">※アルバム全体のコメントです</span>}
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all duration-200 bg-gray-50/50 resize-none"
            placeholder={selectedFiles.length > 1 ? "このアルバムについて一言..." : "この写真について一言..."}
            disabled={uploading}
          />
        </div>
      </div>

      {/* 固定位置のアップロードボタン */}
      <div className="sticky bottom-0 bg-white pt-4 mt-6 border-t border-gray-100">
        <button ref={buttonRef} onClick={handleUpload} disabled={selectedFiles.length === 0 || uploading} className="bubbly-button">
          {uploading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>アップロード中...</span>
            </div>
          ) : (
            `${
              selectedFiles.length === 0
                ? "写真を選択してください"
                : selectedFiles.length === 1
                ? "写真をアップロード"
                : `${selectedFiles.length}枚をアップロード`
            }`
          )}
        </button>
      </div>
    </>
  );
}
