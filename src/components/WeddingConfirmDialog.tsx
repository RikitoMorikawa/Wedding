"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface WeddingConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function WeddingConfirmDialog({ isOpen, onConfirm, onCancel }: WeddingConfirmDialogProps) {
  // Escキーでダイアログを閉じる
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // ダイアログが開いている間はbodyのスクロールを無効化
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      // クリーンアップ時にスクロールを復元
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  // React Portalを使ってdocument.bodyに直接レンダリング
  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
      {/* ダイアログ本体 */}
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all duration-200 scale-100 animate-in fade-in zoom-in-95">
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">写真の確認</h3>
          </div>
        </div>

        {/* メッセージ */}
        <div className="px-6 py-4">
          <p className="text-gray-700 leading-relaxed mb-3">
            この写真は<span className="font-bold text-pink-600">本日の結婚式</span>で撮影したものですか？
          </p>
          <p className="text-sm text-gray-600">結婚式に関係のない写真の投稿はご遠慮ください。</p>
        </div>

        {/* ボタン */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex space-x-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
          >
            いいえ
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 text-white bg-pink-500 hover:bg-pink-600 rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            はい
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
