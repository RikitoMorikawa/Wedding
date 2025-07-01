// src/components/PhotoUpload.tsx - 動画投稿を1件に制限（完全書き直し版）
"use client";

import { useState, useRef } from "react";
import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { v4 as uuidv4 } from "uuid";
import awsconfig from "../aws-exports";
import WeddingConfirmDialog from "./WeddingConfirmDialog";
import BubblyButton from "./BubblyButton";
import { useLanguage } from "@/contexts/LanguageContext";

Amplify.configure(awsconfig);

interface PhotoUploadProps {
  onUploadSuccess: () => void;
  userInfo: { passcode: string; name: string } | null;
  selectedMediaType: "photo" | "video";
}

interface SelectedFile {
  file: File;
  id: string;
  preview: string;
  mediaType: "photo" | "video";
}

// エラータイプの定義
type ErrorType = "file_count" | "file_size" | "total_size" | "file_type" | null;

// ✅ 結婚式70名対応の拡張設定（合計容量制限を削除）
const MAX_PHOTO_FILES = 30; // 写真: 30ファイル（20→30に拡張）
const MAX_VIDEO_FILES = 1; // 動画: 1ファイル
const MAX_PHOTO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 300 * 1024 * 1024; // 300MB（3分程度の動画対応）

export default function PhotoUpload({ onUploadSuccess, userInfo, selectedMediaType }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [caption, setCaption] = useState("");
  const [showWeddingConfirm, setShowWeddingConfirm] = useState(false);
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [errorDetails, setErrorDetails] = useState<string>("");

  const { t } = useLanguage();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const API_BASE = awsconfig.aws_cloud_logic_custom[0].endpoint;

  // ✅ メディアタイプ別の制限値を取得
  const getMaxFiles = () => (selectedMediaType === "photo" ? MAX_PHOTO_FILES : MAX_VIDEO_FILES);
  const getMaxSize = () => (selectedMediaType === "photo" ? MAX_PHOTO_SIZE : MAX_VIDEO_SIZE);
  const getMaxSizeText = () => (selectedMediaType === "photo" ? "50MB" : "300MB");

  // エラーをクリアする関数
  const clearError = () => {
    setErrorType(null);
    setErrorDetails("");
  };

  // ファイル選択処理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    clearError();

    const files = Array.from(event.target.files || []);
    const maxFiles = getMaxFiles();

    let validFiles: File[] = [];

    // ファイル形式チェック
    if (selectedMediaType === "photo") {
      validFiles = files.filter((file) => file.type.startsWith("image/"));
      if (validFiles.length !== files.length) {
        setErrorType("file_type");
        setErrorDetails(t("photo_files_only"));
        return;
      }
    } else if (selectedMediaType === "video") {
      validFiles = files.filter((file) => file.type.startsWith("video/"));
      if (validFiles.length !== files.length) {
        setErrorType("file_type");
        setErrorDetails(t("video_files_only"));
        return;
      }
    }

    if (validFiles.length === 0) {
      setErrorType("file_type");
      setErrorDetails(t("select_file_type"));
      return;
    }

    // ✅ 動画の場合は既に選択済みファイルがあれば警告
    if (selectedMediaType === "video" && selectedFiles.length > 0) {
      setErrorType("file_count");
      setErrorDetails(t("video_limit_one"));
      return;
    }

    // ✅ 動画の場合は複数選択を防ぐ
    if (selectedMediaType === "video" && validFiles.length > 1) {
      setErrorType("file_count");
      setErrorDetails(t("video_one_at_time"));
      return;
    }

    // メディアタイプ別枚数制限チェック
    if (selectedFiles.length + validFiles.length > maxFiles) {
      setErrorType("file_count");
      if (selectedMediaType === "video") {
        setErrorDetails(t("video_limit_one"));
      } else {
        setErrorDetails(`${maxFiles}${t("files_count")}${t("max")}`);
      }
      return;
    }

    // 個別ファイルサイズチェック
    const maxSize = getMaxSize();
    const oversizedFiles = validFiles.filter((file) => file.size > maxSize);

    if (oversizedFiles.length > 0) {
      const maxSizeText = getMaxSizeText();
      setErrorType("file_size");
      setErrorDetails(`${maxSizeText}${t("max")}`);
      return;
    }

    const newFiles: SelectedFile[] = validFiles.map((file) => ({
      file,
      id: uuidv4(),
      preview: URL.createObjectURL(file),
      mediaType: selectedMediaType,
    }));

    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeAllFiles = () => {
    clearError();
    selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
    setSelectedFiles([]);
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const removeFile = (fileId: string) => {
    clearError();
    const fileToRemove = selectedFiles.find((f) => f.id === fileId);
    if (fileToRemove) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    setSelectedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const animateButton = () => {
    if (buttonRef.current) {
      buttonRef.current.classList.remove("animate");
      requestAnimationFrame(() => {
        if (buttonRef.current) {
          buttonRef.current.classList.add("animate");
        }
      });
    }
  };

  // ✅ シンプルなバッチアップロード処理
  const performBatchUpload = async () => {
    if (selectedFiles.length === 0 || !userInfo) return;

    animateButton();
    setUploading(true);
    clearError();

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();

      if (!token) {
        throw new Error("認証トークンが取得できませんでした");
      }

      const albumId = uuidv4();
      const uploadedAt = new Date().toISOString();

      // Step 1: 署名付きURLを一括取得
      const filesInfo = selectedFiles.map((file, index) => ({
        fileName: file.file.name,
        fileType: file.file.type,
        size: file.file.size,
        mediaType: file.mediaType,
        fileIndex: index,
      }));

      console.log("🔄 署名付きURLを一括取得中...");
      const urlResponse = await fetch(`${API_BASE}/photos/batch-upload-urls`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          files: filesInfo,
          passcode: userInfo.passcode,
        }),
      });

      const urlResult = await urlResponse.json();
      if (!urlResult.success) {
        throw new Error(urlResult.message || "Failed to get upload URLs");
      }

      console.log(`✅ ${urlResult.uploadUrls.length}個の署名付きURL取得完了`);

      // Step 2: 全ファイルをS3に並行アップロード
      const uploadPromises = selectedFiles.map(async (selectedFile, index) => {
        const uploadInfo = urlResult.uploadUrls[index];

        try {
          const response = await fetch(uploadInfo.uploadURL, {
            method: "PUT",
            body: selectedFile.file,
            headers: { "Content-Type": selectedFile.file.type },
          });

          if (!response.ok) {
            throw new Error(`S3 upload failed: ${response.statusText}`);
          }

          return {
            success: true,
            photoId: uuidv4(),
            s3Key: uploadInfo.s3Key,
            mediaType: uploadInfo.mediaType,
            fileType: uploadInfo.fileType,
            fileName: uploadInfo.fileName,
            size: uploadInfo.size,
            fileIndex: index,
          };
        } catch (error) {
          console.error(`Error uploading ${selectedFile.file.name}:`, error);
          return {
            success: false,
            error,
            fileName: selectedFile.file.name,
            fileIndex: index,
          };
        }
      });

      const uploadResults = await Promise.all(uploadPromises);
      const successfulUploads = uploadResults.filter((result) => result.success);
      const failedUploads = uploadResults.filter((result) => !result.success);

      if (failedUploads.length > 0) {
        console.error(`${failedUploads.length}個のファイルアップロードが失敗:`, failedUploads);
        throw new Error(`${failedUploads.length}個のファイルのアップロードに失敗しました`);
      }

      console.log(`✅ 全${successfulUploads.length}ファイルのS3アップロード完了`);

      // Step 3: 1回のAPIで全メタデータを保存
      console.log("🔄 バッチでメタデータ保存中...");
      const saveResponse = await fetch(`${API_BASE}/photos/batch-save-album`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          albumId: albumId,
          uploadedBy: userInfo.passcode,
          uploaderName: userInfo.name,
          caption: caption,
          uploadedAt: uploadedAt,
          files: successfulUploads,
          passcode: userInfo.passcode,
        }),
      });

      const saveResult = await saveResponse.json();
      if (!saveResult.success) {
        throw new Error(saveResult.message || "Failed to save album metadata");
      }

      console.log(`✅ アルバム保存完了: ${saveResult.totalFiles}ファイル、${saveResult.batches}バッチ`);

      // 完了処理
      selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
      setSelectedFiles([]);
      setCaption("");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      setTimeout(() => {
        onUploadSuccess();
      }, 1000);
    } catch (error) {
      console.error("Batch upload error:", error);

      if (error instanceof Error) {
        if (error.message.includes("exceeds") && error.message.includes("limit")) {
          alert(`❌ ファイルサイズエラー\n${error.message}`);
        } else if (error.message.includes("already exist")) {
          alert(t("duplicate_error"));
        } else if (error.message.includes("overloaded")) {
          alert(t("server_overload_error"));
        } else {
          alert(`❌ ${t("upload_error")}\n${error.message}`);
        }
      } else {
        alert(`❌ ${t("unexpected_error")}`);
      }

      setTimeout(() => {
        onUploadSuccess();
      }, 2000);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadClick = () => {
    if (selectedFiles.length === 0) return;
    setShowWeddingConfirm(true);
  };

  const handleWeddingConfirm = () => {
    setShowWeddingConfirm(false);
    performBatchUpload();
  };

  const handleWeddingCancel = () => {
    setShowWeddingConfirm(false);
  };

  // エラーメッセージを取得する関数
  const getErrorMessage = () => {
    if (!errorType) return null;

    switch (errorType) {
      case "file_count":
        return `${t("count_over")}（${errorDetails}）`;
      case "file_size":
        return `${t("size_over")}（${errorDetails}）`;
      case "total_size":
        return `サイズオーバー（${errorDetails}）`;
      case "file_type":
        return errorDetails;
      default:
        return null;
    }
  };

  const maxFiles = getMaxFiles();

  return (
    <>
      <div className="space-y-4">
        {/* ファイル選択エリア */}
        <div>
          <label
            htmlFor="file-input"
            className={`
              block w-full p-4 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]
              ${
                uploading
                  ? "border-gray-300 bg-gray-100 cursor-not-allowed"
                  : errorType
                  ? "border-red-400 bg-red-50/50 hover:bg-red-50"
                  : "border-pink-300 bg-pink-50/50 hover:bg-pink-50"
              }
            `}
          >
            <div className="flex flex-col items-center justify-center py-3">
              <div className="text-3xl mb-2">{selectedMediaType === "photo" ? "📷" : "🎥"}</div>
              <p className={`text-sm font-medium ${errorType ? "text-red-600" : "text-pink-600"}`}>
                {selectedFiles.length === 0
                  ? `${selectedMediaType === "photo" ? t("photo") : t("video")}${t("tap_to_select")}`
                  : `${selectedMediaType === "photo" ? t("photo") : t("video")}${t("add_files")}`}
              </p>
              <p className="text-xs text-gray-500 mt-1">{selectedMediaType === "photo" ? t("file_formats_photo") : t("file_formats_video")}</p>
              {/* ✅ 動画の場合は1件制限と3分対応を明示 */}
              {selectedMediaType === "photo" && <p className="text-xs text-purple-600 mt-1 font-medium">{t("photo_limit_30")}</p>}
              {selectedMediaType === "video" && <p className="text-xs text-purple-600 mt-1 font-medium">{t("video_limit_3min")}</p>}
            </div>
            <input
              id="file-input"
              type="file"
              accept={selectedMediaType === "photo" ? "image/*" : "video/*"}
              multiple={selectedMediaType === "photo"} // ✅ 動画の場合はmultipleを無効化
              onChange={handleFileSelect}
              className="hidden"
              disabled={selectedFiles.length >= maxFiles || uploading}
            />
          </label>

          {/* エラーメッセージ表示エリア */}
          {errorType && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="ml-3 flex-1">
                <p className="text-sm text-red-800 font-medium">{getErrorMessage()}</p>
              </div>
              <button onClick={clearError} className="ml-2 text-red-500 hover:text-red-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* 選択されたファイルの情報 */}
        {selectedFiles.length > 0 && (
          <div className="bg-pink-50/50 rounded-2xl p-3">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">
                {t("selected_files")}
                {selectedMediaType === "photo" ? t("main_photo") : t("main_video")}
              </h3>
              <div className="flex justify-between text-xs text-gray-600 items-center">
                <span>
                  {selectedFiles.length}/{maxFiles} {t("files_count")}
                </span>
                {selectedFiles.length > 1 && (
                  <button onClick={removeAllFiles} className="text-red-500 hover:text-red-700 font-medium" disabled={uploading}>
                    {t("clear_all")}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-32 overflow-y-auto">
              {selectedFiles.map((selectedFile, index) => (
                <div key={selectedFile.id} className="flex items-center justify-between bg-white rounded-lg p-2">
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <div className="w-8 h-8 bg-pink-100 rounded flex items-center justify-center flex-shrink-0">
                      <span className="text-xs">{selectedFile.mediaType === "photo" ? "📷" : "🎥"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{selectedFile.file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.file.size / (1024 * 1024)).toFixed(1)}MB
                        {index === 0 && selectedFiles.length > 1 && (
                          <span className="ml-1 text-pink-600">{selectedMediaType === "photo" ? t("main_photo") : t("main_video")}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(selectedFile.id)}
                    className="p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"
                    disabled={uploading}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* キャプション入力 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            {t("comment_optional")}
            {selectedFiles.length > 1 && <span className="text-xs text-gray-500 ml-2">{t("album_comment_note")}</span>}
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all duration-200 bg-gray-50/50 resize-none"
            placeholder={selectedFiles.length > 1 ? t("album_comment_placeholder") : t("single_comment_placeholder")}
            disabled={uploading}
          />
        </div>

        {/* アップロードボタン */}
        <div className="pt-3">
          <BubblyButton ref={buttonRef} onClick={handleUploadClick} disabled={selectedFiles.length === 0 || uploading || errorType !== null}>
            {uploading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>{t("uploading")}</span>
              </div>
            ) : (
              `${
                selectedFiles.length === 0 || errorType !== null
                  ? `${selectedMediaType === "photo" ? t("photo") : t("video")}${t("please_select")}`
                  : selectedFiles.length === 1
                  ? `${selectedMediaType === "photo" ? t("photo") : t("video")}${t("upload_files")}`
                  : `${selectedFiles.length}${t("files_count")}${t("bulk_upload")}`
              }`
            )}
          </BubblyButton>
        </div>
      </div>

      {/* 確認ダイアログ */}
      <WeddingConfirmDialog isOpen={showWeddingConfirm} onConfirm={handleWeddingConfirm} onCancel={handleWeddingCancel} />
    </>
  );
}