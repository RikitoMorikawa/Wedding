"use client";

import { useState } from "react";
import { Amplify } from "aws-amplify";
import { uploadData } from "aws-amplify/storage";
import { getCurrentUser } from "aws-amplify/auth";
import { v4 as uuidv4 } from "uuid";
import awsconfig from "../aws-exports";

// Amplifyの設定
Amplify.configure(awsconfig);

interface PhotoUploadProps {
  onUploadSuccess: () => void;
}

export default function PhotoUpload({ onUploadSuccess }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file);
    } else {
      alert("画像ファイルを選択してください");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const user = await getCurrentUser();
      const fileKey = `photos/${uuidv4()}-${selectedFile.name}`;

      const result = await uploadData({
        key: fileKey,
        data: selectedFile,
        options: {
          metadata: {
            uploadedBy: user.username,
            caption: caption,
            uploadedAt: new Date().toISOString(),
          },
        },
      }).result;

      console.log("Upload successful:", result);

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

      {/* アップロードボタン */}
      <button
        onClick={handleUpload}
        disabled={!selectedFile || uploading}
        className={`w-full py-4 px-6 rounded-2xl font-bold transition-all duration-200 ${
          !selectedFile || uploading
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            アップロード中...
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            写真をアップロード
          </div>
        )}
      </button>
    </div>
  );
}
