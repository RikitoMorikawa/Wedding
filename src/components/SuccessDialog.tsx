"use client";

import { useState, useEffect } from "react";

interface SuccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  uploadedCount?: number;
  failedCount?: number;
}

export default function SuccessDialog({
  isOpen,
  onClose,
  title,
  message,
  uploadedCount = 0,
  failedCount = 0,
}: SuccessDialogProps) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // ダイアログが開かれた時の遅延アニメーション
      const timer = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // 3秒後に自動で閉じる
      const timer = setTimeout(() => {
        handleClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = () => {
    setShowContent(false);
    setTimeout(() => onClose(), 200);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* フローティングパーティクル用CSS */}
      <style jsx>{`
        .confetti {
          position: absolute;
          width: 10px;
          height: 10px;
          background: #ff0081;
          border-radius: 50%;
        }

        .confetti:nth-child(1) {
          background: #ff0081;
          left: 10%;
          animation: confetti-fall 3s linear infinite;
          animation-delay: 0s;
        }

        .confetti:nth-child(2) {
          background: #00d4ff;
          left: 20%;
          animation: confetti-fall 3s linear infinite;
          animation-delay: 0.2s;
        }

        .confetti:nth-child(3) {
          background: #ffb800;
          left: 30%;
          animation: confetti-fall 3s linear infinite;
          animation-delay: 0.4s;
        }

        .confetti:nth-child(4) {
          background: #ff0081;
          left: 40%;
          animation: confetti-fall 3s linear infinite;
          animation-delay: 0.6s;
        }

        .confetti:nth-child(5) {
          background: #00d4ff;
          left: 50%;
          animation: confetti-fall 3s linear infinite;
          animation-delay: 0.8s;
        }

        .confetti:nth-child(6) {
          background: #ffb800;
          left: 60%;
          animation: confetti-fall 3s linear infinite;
          animation-delay: 1s;
        }

        .confetti:nth-child(7) {
          background: #ff0081;
          left: 70%;
          animation: confetti-fall 3s linear infinite;
          animation-delay: 1.2s;
        }

        .confetti:nth-child(8) {
          background: #00d4ff;
          left: 80%;
          animation: confetti-fall 3s linear infinite;
          animation-delay: 1.4s;
        }

        .confetti:nth-child(9) {
          background: #ffb800;
          left: 90%;
          animation: confetti-fall 3s linear infinite;
          animation-delay: 1.6s;
        }

        @keyframes confetti-fall {
          0% {
            top: -10px;
            transform: rotate(0deg);
            opacity: 1;
          }
          100% {
            top: 100vh;
            transform: rotate(720deg);
            opacity: 0;
          }
        }

        .success-pulse {
          animation: pulse-glow 1.5s ease-in-out infinite;
        }

        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
          }
          50% {
            box-shadow: 0 0 40px rgba(34, 197, 94, 0.7);
          }
        }

        .success-bounce {
          animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        @keyframes bounce-in {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.8;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .slide-up {
          animation: slide-up 0.4s ease-out;
        }

        @keyframes slide-up {
          0% {
            transform: translateY(20px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* オーバーレイ */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${
          showContent ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      >
        {/* コンフェッティ */}
        {failedCount === 0 && (
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div className="confetti"></div>
            <div className="confetti"></div>
            <div className="confetti"></div>
            <div className="confetti"></div>
            <div className="confetti"></div>
            <div className="confetti"></div>
            <div className="confetti"></div>
            <div className="confetti"></div>
            <div className="confetti"></div>
          </div>
        )}

        {/* ダイアログ */}
        <div
          className={`bg-white/95 backdrop-blur-md rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl border border-white/30 transform transition-all duration-300 ${
            showContent ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* アイコンとタイトル */}
          <div className="text-center mb-4">
            {failedCount === 0 ? (
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 success-pulse success-bounce">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 success-bounce">
                <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            )}

            <h3 className={`text-xl font-bold mb-2 slide-up ${
              failedCount === 0 
                ? "bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent" 
                : "bg-gradient-to-r from-yellow-600 to-orange-500 bg-clip-text text-transparent"
            }`}>
              {title}
            </h3>

            <p className="text-gray-600 text-sm slide-up" style={{ animationDelay: "0.1s" }}>
              {message}
            </p>
          </div>

          {/* 統計情報 */}
          {(uploadedCount > 0 || failedCount > 0) && (
            <div className="bg-gray-50/80 rounded-2xl p-4 mb-4 slide-up" style={{ animationDelay: "0.2s" }}>
              <div className="flex justify-between items-center text-sm">
                {uploadedCount > 0 && (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-gray-700">成功: {uploadedCount}枚</span>
                  </div>
                )}
                {failedCount > 0 && (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-gray-700">失敗: {failedCount}枚</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 閉じるボタン */}
          <div className="flex justify-center slide-up" style={{ animationDelay: "0.3s" }}>
            <button
              onClick={handleClose}
              className={`px-6 py-2 rounded-full text-white font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
                failedCount === 0
                  ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-lg hover:shadow-green-200"
                  : "bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 shadow-lg hover:shadow-yellow-200"
              }`}
            >
              OK
            </button>
          </div>

          {/* 自動閉じるプログレスバー */}
          <div className="mt-4 slide-up" style={{ animationDelay: "0.4s" }}>
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div 
                className={`h-1 rounded-full ${
                  failedCount === 0 ? "bg-green-500" : "bg-yellow-500"
                }`}
                style={{
                  width: "100%",
                  animation: "progress-countdown 3s linear forwards"
                }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 text-center mt-1">3秒後に自動で閉じます</p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes progress-countdown {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </>
  );
}
