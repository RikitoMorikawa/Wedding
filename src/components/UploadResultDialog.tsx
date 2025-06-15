"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface UploadResultDialogProps {
  isOpen: boolean;
  isSuccess: boolean;
  message: string;
  onClose: () => void;
  autoCloseDelay?: number; // milliseconds
}

export default function UploadResultDialog({
  isOpen,
  isSuccess,
  message,
  onClose,
  autoCloseDelay = 3000, // デフォルト3秒
}: UploadResultDialogProps) {
  // 自動でダイアログを閉じる
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoCloseDelay, onClose]);

  if (!isOpen) return null;

  // React Portalを使ってdocument.bodyに直接レンダリング
  return createPortal(
    <>
      {/* CSS */}
      <style jsx>{`
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
          animation: progress ${autoCloseDelay}ms linear forwards;
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

      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[99999] p-4">
        <div
          className={`bg-white rounded-3xl p-6 max-w-sm w-full mx-auto shadow-2xl border border-gray-200 dialog-slide-in ${
            isSuccess ? "border-green-200" : "border-yellow-200"
          }`}
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
              {message.split("\n").map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </div>
          </div>

          {/* 閉じるボタン */}
          <div className="flex justify-center mb-4">
            <button
              onClick={onClose}
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
          <p className="text-xs text-gray-500 text-center mt-1">{autoCloseDelay / 1000}秒後に自動で閉じます</p>
        </div>
      </div>
    </>,
    document.body
  );
}
