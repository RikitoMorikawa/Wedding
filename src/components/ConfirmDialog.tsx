"use client";

import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ isOpen, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useLanguage();

  // Escキーでダイアログを閉じる
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // モーダル背景のスクロールを防ぐ
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      {/* ダイアログ本体 */}
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all duration-200 scale-100">
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">{t("deleted_photo_confirmation")}</h3>
          </div>
        </div>

        {/* メッセージ */}
        <div className="px-6 py-4">
          <p className="text-gray-700 leading-relaxed">{t("photo_is_deleted")}</p>
          <p className="text-gray-700 leading-relaxed mt-3 whitespace-pre-line">{t("cannot_restore_after_close")}</p>
          <p className="text-gray-800 font-medium mt-4">{t("really_close_modal")}</p>
        </div>

        {/* ボタン */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex space-x-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
          >
            {t("cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-all duration-200 font-medium"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
