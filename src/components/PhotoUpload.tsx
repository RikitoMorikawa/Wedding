// PhotoUpload.tsx - シンプル版（ダイアログ内蔵）
"use client";

import { useState, useRef, useEffect } from "react";
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

  // シンプルなダイアログ状態
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(true);
  const [shouldCloseModal, setShouldCloseModal] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);

  // 3秒後に自動でダイアログを閉じる
  useEffect(() => {
    if (showDialog) {
      const timer = setTimeout(() => {
        setShowDialog(false);
        // ダイアログが閉じた後にモーダルも閉じる
        if (shouldCloseModal) {
          setTimeout(() => {
            onUploadSuccess();
            setShouldCloseModal(false);
          }, 300);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showDialog, shouldCloseModal, onUploadSuccess]);

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

  const showSuccessDialog = (message: string) => {
    setDialogMessage(message);
    setIsSuccess(true);
    setShowDialog(true);
    setShouldCloseModal(true);
  };

  const showErrorDialog = (message: string) => {
    setDialogMessage(message);
    setIsSuccess(false);
    setShowDialog(true);
    setShouldCloseModal(true);
  };

  const handleUpload = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (selectedFiles.length === 0 || !userInfo) return;

    animateButton();
    setUploading(true);

    try {
      const user = await getCurrentUser();
      const albumId = uuidv4();
      const uploadedAt = new Date().toISOString();

      const uploadPromises = selectedFiles.map(async (selectedFile, index) => {
        const photoId = uuidv4();
        const fileKey = `photos/${albumId}/${photoId}-${selectedFile.file.name}`;

        try {
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

          const response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/photos/save-album`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              photoId: photoId,
              albumId: albumId,
              uploadedBy: user.username,
              caption: index === 0 ? caption : "",
              s3Key: fileKey,
              uploaderName: userInfo.name,
              uploadedAt: uploadedAt,
              photoIndex: index,
              totalPhotos: selectedFiles.length,
              isMainPhoto: index === 0,
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

      selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
      setSelectedFiles([]);
      setCaption("");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      // シンプルなダイアログ表示（onUploadSuccessは自動で後から実行）
      if (failureCount === 0) {
        showSuccessDialog(`🎉 アップロード完了！\n投稿ありがとうございます！ \nRikito & Yuria ❤️`);
      } else {
        showErrorDialog(`⚠️ アップロード完了\n${successCount}枚が成功、${failureCount}枚が失敗しました`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      showErrorDialog("❌ アップロードエラー\nアップロード中にエラーが発生しました");
    } finally {
      setUploading(false);
    }
  };

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

        .dialog-slide-in {
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .progress-bar {
          animation: progress 3s linear forwards;
        }

        @keyframes progress {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>

      {/* モーダル内に完全に収まるレイアウト */}
      <div className="space-y-4">
        {/* ファイル選択エリア */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            写真を選択 ({selectedFiles.length}/{MAX_FILES}枚)
            {selectedFiles.length > 0 && <span className="text-xs text-gray-500 ml-2">({totalFileSize.toFixed(1)}MB)</span>}
          </label>

          <label
            htmlFor="file-input"
            className="flex flex-col items-center justify-center w-full h-24 sm:h-28 border-2 border-dashed border-pink-300 rounded-2xl cursor-pointer bg-pink-50/50 hover:bg-pink-50 transition-colors"
          >
            <div className="flex flex-col items-center justify-center py-3">
              <svg className="w-6 h-6 sm:w-7 sm:h-7 mb-1 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <p className="text-xs sm:text-sm text-pink-600 font-medium">{selectedFiles.length === 0 ? "写真をタップして選択" : "写真を追加"}</p>
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

        {/* 選択されたファイルの情報 */}
        {selectedFiles.length > 0 && (
          <div className="bg-pink-50/50 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">選択中の写真 ({selectedFiles.length}枚)</h3>
              <button onClick={removeAllFiles} className="text-xs text-red-500 hover:text-red-700 font-medium" disabled={uploading}>
                すべて削除
              </button>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {selectedFiles.map((selectedFile, index) => (
                <div key={selectedFile.id} className="flex items-center justify-between bg-white rounded-lg p-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-pink-100 rounded-lg flex items-center justify-center">
                      {index === 0 ? <span className="text-pink-600 text-xs font-bold">★</span> : <span className="text-pink-600 text-xs">{index + 1}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate">{selectedFile.file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.file.size / (1024 * 1024)).toFixed(1)}MB
                        {index === 0 && <span className="ml-1 text-pink-600">（メイン写真）</span>}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
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

        {/* アップロードボタン - モーダル内の最下部 */}
        <div className="pt-3">
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

        {/* シンプルなダイアログ（内蔵） */}
        {showDialog && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div
              className={`bg-white rounded-3xl p-6 max-w-sm w-full mx-auto shadow-2xl border border-gray-200 dialog-slide-in ${
                isSuccess ? "border-green-200" : "border-yellow-200"
              }`}
              style={{ zIndex: 10000 }}
            >
              {/* アイコン */}
              <div className="text-center mb-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isSuccess ? "bg-green-100" : "bg-yellow-100"}`}>
                  {isSuccess ? (
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                    </svg>
                  )}
                </div>

                {/* メッセージ */}
                <div className={`text-lg font-bold mb-2 ${isSuccess ? "text-green-600" : "text-yellow-600"}`}>
                  {dialogMessage.split("\n").map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              </div>

              {/* 閉じるボタン */}
              <div className="flex justify-center mb-4">
                <button
                  onClick={() => {
                    setShowDialog(false);
                    // 手動で閉じた場合もモーダルを閉じる
                    if (shouldCloseModal) {
                      setTimeout(() => {
                        onUploadSuccess();
                        setShouldCloseModal(false);
                      }, 500);
                    }
                  }}
                  className={`px-6 py-2 rounded-full text-white font-medium transition-all duration-200 hover:scale-105 ${
                    isSuccess ? "bg-green-500 hover:bg-green-600" : "bg-yellow-500 hover:bg-yellow-600"
                  }`}
                >
                  OK
                </button>
              </div>

              {/* プログレスバー */}
              <div className="w-full bg-gray-200 rounded-full h-1">
                <div className={`h-1 rounded-full progress-bar ${isSuccess ? "bg-green-500" : "bg-yellow-500"}`}></div>
              </div>
              <p className="text-xs text-gray-500 text-center mt-1">5秒後に自動で閉じます</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
