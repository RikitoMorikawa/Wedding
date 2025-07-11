"use client";

import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import { Amplify } from "aws-amplify";
import { getUrl } from "aws-amplify/storage";
import awsconfig from "../aws-exports";
import ConfirmDialog from "./ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";

// Amplifyの設定
Amplify.configure(awsconfig);

interface Photo {
  photoId: string;
  uploadedBy: string;
  uploaderName: string;
  caption: string;
  uploadedAt: string;
  s3Key: string;
  photoIndex: number;
  url?: string;
  mediaType?: "photo" | "video";
  fileType?: string;
  thumbnailS3Key?: string; // ← 既存：サムネイル画像のS3キー
  thumbnailUrl?: string; // ← 新規追加：サムネイル画像のURL（フロントエンド用）
  processingStatus: "pending" | "processing" | "ready" | "failed"; // ← 既存
}

interface Album {
  albumId: string;
  photos: Photo[];
  mainPhoto: Photo;
  uploadedBy: string;
  uploaderName: string;
  uploadedAt: string;
  caption: string;
  totalPhotos: number;
  mainPhotoUrl?: string;
  favoriteCount?: number;
  isFavorite?: boolean;
  isPublic?: boolean;
  mediaType?: "photo" | "video";
}

interface PhotoGalleryProps {
  refreshTrigger: number;
  userInfo: {
    passcode: string;
    name: string;
  } | null;
}

type SortType = "date" | "favorites";

// ===== デバウンスフック =====
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// ===== Intersection Observer フック =====
const useLazyLoading = (threshold: number = 0.1) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold]);

  return [ref, isVisible] as const;
};

// ===== 画像プリロードフック =====
const useImagePreloader = (imageUrls: string[], priority: number = 5) => {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (imageUrls.length === 0) return;

    const urlsToPreload = imageUrls.slice(0, priority);

    const preloadPromises = urlsToPreload.map((url) => {
      return new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = reject;
        img.src = url;
      });
    });

    Promise.allSettled(preloadPromises).then((results) => {
      const loaded = new Set<string>();
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          loaded.add(urlsToPreload[index]);
        }
      });
      setLoadedImages((prev) => new Set([...prev, ...loaded]));
    });
  }, [imageUrls, priority]);

  return loadedImages;
};

// ✅ 新規追加: 静的プレースホルダーコンポーネント
const VideoPlaceholder = memo(({ album, loading = false }: { album: Album; loading?: boolean }) => {
  const { t } = useLanguage();

  return (
    <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center relative">
      {loading ? (
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-white/90 text-sm font-medium">{t("processing")}</p>
        </div>
      ) : (
        <div className="text-center">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <p className="text-white/90 text-sm font-medium">{t("video")}</p>
          <p className="text-white/60 text-xs mt-1">{album.uploaderName || "Video"}</p>
        </div>
      )}

      {/* 識別用のユニークな要素 */}
      <div className="absolute bottom-2 left-2 bg-black/40 rounded px-2 py-1">
        <span className="text-white text-xs font-mono">{album.albumId?.substring(0, 6) || "VIDEO"}</span>
      </div>
    </div>
  );
});

VideoPlaceholder.displayName = "VideoPlaceholder";

// ===== ローディング状態コンポーネント =====
const LoadingState = memo(() => {
  const { t } = useLanguage();

  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-8 h-8 border-2 border-pink-300 border-t-pink-600 rounded-full animate-spin"></div>
        <p className="text-gray-600">{t("loading_photos")}</p>
      </div>
    </div>
  );
});

LoadingState.displayName = "LoadingState";

// ===== 空状態コンポーネント =====
const EmptyState = memo(({ mediaFilter, isAlbumsEmpty = false }: { mediaFilter: "all" | "photo" | "video"; isAlbumsEmpty?: boolean }) => {
  const { t } = useLanguage();

  return (
    <div className="text-center py-12">
      {isAlbumsEmpty ? (
        <>
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">{t("no_photos_yet")}</h3>
          <p className="text-gray-600">{t("upload_first_photo")}</p>
        </>
      ) : (
        <>
          <div className="text-6xl mb-4">📸</div>
          <p className="text-gray-500 text-lg">
            {mediaFilter === "all" ? t("no_photos_uploaded") : mediaFilter === "photo" ? t("no_photos_found") : t("no_videos_found")}
          </p>
          <p className="text-gray-400 text-sm mt-2">{mediaFilter === "all" ? t("share_first_memory") : t("try_other_media_types")}</p>
        </>
      )}
    </div>
  );
});

EmptyState.displayName = "EmptyState";

// ===== 最適化されたアルバムアイテム =====
// ===== 修正1: AlbumItemコンポーネント =====
const AlbumItem = memo(({ album, onClick, isOwner }: { album: Album; onClick: () => void; isOwner: (album: Album) => boolean }) => {
  const [ref, isVisible] = useLazyLoading(0.1);
  const { t } = useLanguage();

  // ✅ 修正: 表示画像の決定ロジック
  const displayImage = useMemo(() => {
    if (!isVisible) return null;

    // 動画の場合
    if (album.mainPhoto?.mediaType === "video") {
      // 1. thumbnailUrlを優先
      if (album.mainPhoto?.thumbnailUrl) {
        return album.mainPhoto.thumbnailUrl;
      }
      // 2. サムネイルがない場合はnull（プレースホルダー表示）
      console.log(`📹 サムネイルなし、プレースホルダー表示: ${album.albumId}`);
      return null;
    }

    // 写真の場合
    return album.mainPhotoUrl;
  }, [album.mainPhoto?.mediaType, album.mainPhoto?.thumbnailUrl, album.mainPhotoUrl, isVisible, album.albumId]);

  const isVideoProcessing = album.mainPhoto?.mediaType === "video" && album.mainPhoto?.processingStatus === "processing";

  return (
    <div
      ref={ref}
      className="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden cursor-pointer group hover:shadow-lg transition-all duration-200 hover:scale-105"
      onClick={onClick}
    >
      {isVisible ? (
        displayImage ? (
          // ✅ 画像表示（写真 or 動画サムネイル）
          <img
            src={displayImage}
            alt={album.caption || "Wedding album"}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              console.error(`画像読み込みエラー: ${displayImage}`);
              // エラー時はプレースホルダーを表示
              e.currentTarget.style.display = "none";
            }}
          />
        ) : album.mainPhoto?.mediaType === "video" ? (
          // ✅ 動画プレースホルダー
          <VideoPlaceholder album={album} loading={isVideoProcessing} />
        ) : (
          // その他のエラー表示
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-400 rounded-full flex items-center justify-center mx-auto mb-2">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="text-xs text-gray-500">{t("image")}</p>
            </div>
          </div>
        )
      ) : (
        <div className="w-full h-full bg-gray-200 animate-pulse"></div>
      )}

      {/* 動画識別バッジ */}
      {isVisible && album.mainPhoto?.mediaType === "video" && (
        <div className="absolute top-2 right-2">
          <div className=" backdrop-blur-sm rounded-lg px-2 py-1 flex items-center space-x-1">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* 複数枚表示のバッジ */}
      {album.totalPhotos > 1 && (
        <div className="absolute top-2 right-2">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center space-x-1">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span className="text-white text-xs font-medium">{album.totalPhotos}</span>
          </div>
        </div>
      )}

      {/* 削除済みバッジ - 多言語対応 */}
      {isOwner(album) && album.isPublic === false && (
        <div className="absolute top-2 right-2 ml-1">
          <div className="bg-red-600/90 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center space-x-1">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span className="text-white text-xs font-medium">{t("deleted")}</span>
          </div>
        </div>
      )}

      {/* お気に入り件数バッジ */}
      {album.favoriteCount !== undefined && album.favoriteCount > 0 && (
        <div className="absolute top-2 left-2">
          <div className="bg-red-500/90 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center space-x-1">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="text-white text-xs font-medium">{album.favoriteCount}</span>
          </div>
        </div>
      )}

      {/* 投稿者情報 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
        <p className="text-white text-xs font-medium truncate">{album.uploaderName || album.uploadedBy}</p>
        {album.caption && <p className="text-white/80 text-xs truncate mt-1">{album.caption}</p>}
      </div>
    </div>
  );
});

AlbumItem.displayName = "AlbumItem";

// ===== 修正2: ThumbnailItemコンポーネント =====
const ThumbnailItem = memo(({ photo, index, isSelected, onClick }: { photo: Photo; index: number; isSelected: boolean; onClick: () => void }) => {
  const { t } = useLanguage();

  // ❌ 削除: この行を削除
  // const { thumbnailUrl, loading } = useVideoThumbnail(photo.mediaType === "video" && photo.url ? photo.url : "", 0.1);

  // ✅ 追加: シンプルな条件分岐のみ
  const displayImage = useMemo(() => {
    if (photo.mediaType === "video") {
      return photo.thumbnailUrl || null; // サムネイルURLを使用（なければnull）
    }
    return photo.url;
  }, [photo.mediaType, photo.thumbnailUrl, photo.url]);

  return (
    <button
      onClick={onClick}
      className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
        isSelected ? "border-pink-400 scale-110 shadow-lg" : "border-white/30 hover:border-white/60 hover:scale-105"
      }`}
    >
      {displayImage ? (
        <img
          src={displayImage}
          alt={`${photo.mediaType === "video" ? t("video") : t("photo")} ${index + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : photo.mediaType === "video" ? (
        // ✅ 動画サムネイルなしの場合のプレースホルダー
        <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center">
          <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-2 h-2 text-white ml-0.1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      ) : (
        // その他のエラー表示
        <div className="w-full h-full bg-gray-200 flex items-center justify-center rounded-lg">
          <div className="w-4 h-4 bg-black/60 rounded-full flex items-center justify-center">
            <svg className="w-2 h-2 text-white ml-0.1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* 動画バッジ */}
      {photo.mediaType === "video" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-4 h-4 bg-black/60 rounded-full flex items-center justify-center">
            <svg className="w-2 h-2 text-white ml-0.1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </button>
  );
});

ThumbnailItem.displayName = "ThumbnailItem";

// ===== メインコンポーネント =====
export default function PhotoGallery({ refreshTrigger, userInfo }: PhotoGalleryProps) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [sortType, setSortType] = useState<SortType>("date");
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<"all" | "photo" | "video">("all");

  // 🆕 多言語対応フックを追加
  const { t, language } = useLanguage();

  // デバウンスフィルター
  const debouncedMediaFilter = useDebounce(mediaFilter, 300);

  // API Base URL
  const API_BASE = awsconfig.aws_cloud_logic_custom[0].endpoint;

  // アルバムをソートする関数（メモ化）
  const sortAlbums = useCallback((albumsList: Album[], sortType: SortType): Album[] => {
    const sortedAlbums = [...albumsList];

    switch (sortType) {
      case "favorites":
        return sortedAlbums.sort((a, b) => {
          const aCount = a.favoriteCount || 0;
          const bCount = b.favoriteCount || 0;
          if (bCount !== aCount) {
            return bCount - aCount;
          }
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        });
      case "date":
      default:
        return sortedAlbums.sort((a, b) => {
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        });
    }
  }, []);

  // フィルタリング（メモ化）
  const filteredAlbums = useMemo(() => {
    if (debouncedMediaFilter === "all") {
      return albums;
    }
    return albums.filter((album) => album.mainPhoto?.mediaType === debouncedMediaFilter);
  }, [albums, debouncedMediaFilter]);

  // ソート済みアルバム（メモ化）
  const sortedFilteredAlbums = useMemo(() => {
    return sortAlbums(filteredAlbums, sortType);
  }, [filteredAlbums, sortType, sortAlbums]);

  // プリロード用の画像URL（メモ化）
  const imageUrls = useMemo(() => {
    return sortedFilteredAlbums
      .slice(0, 10)
      .map((album) => album.mainPhotoUrl)
      .filter(Boolean) as string[];
  }, [sortedFilteredAlbums]);

  // 画像プリロード
  useImagePreloader(imageUrls, 5);

  // アルバム一覧を取得（メモ化）
  // =============================================================================
  // 🔄 PhotoGallery.tsx - fetchAlbums関数の置き換え版
  // =============================================================================

  // ===== 修正3: loadAlbums関数でサムネイルURL生成を追加 =====
  // src/components/PhotoGallery.tsx
  // fetchAlbums関数のサムネイル処理を修正

  const fetchAlbums = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_BASE}/photos/albums`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch albums");
      }

      // Step 1: 基本情報のみで即座に表示
      const albumsWithUrls = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.albums.map(async (album: any) => {
          try {
            const urlResult = await getUrl({ key: album.mainPhoto.s3Key });

            // ✅ 修正: サムネイルもAmplify署名付きURLで生成
            let thumbnailUrl = null;
            if (album.mainPhoto?.mediaType === "video") {
              // DynamoDBのthumbnailUrlは無視し、S3キーから署名付きURL生成
              const thumbnailS3Key = `thumbnails/${album.mainPhoto.photoId}-thumbnail.jpg`;

              try {
                // まず新しい形式（-thumbnail.jpg）を試行
                const thumbResult = await getUrl({ key: thumbnailS3Key });
                thumbnailUrl = thumbResult.url.toString();
              } catch {
                console.log(`⚠️ 新形式サムネイルなし: ${thumbnailS3Key}`);

                // フォールバック: 古い形式（_thumbnail.svg）を試行
                try {
                  const oldThumbnailKey = `thumbnails/${album.mainPhoto.photoId}_thumbnail.svg`;
                  const oldThumbResult = await getUrl({ key: oldThumbnailKey });
                  thumbnailUrl = oldThumbResult.url.toString();
                  console.log(`🔄 旧形式サムネイル使用: ${album.albumId} -> ${oldThumbnailKey}`);
                } catch {
                  console.log(`❌ サムネイルなし: ${album.albumId}`);
                  thumbnailUrl = null;
                }
              }
            }

            return {
              ...album,
              mainPhotoUrl: urlResult.url.toString(),
              mainPhoto: {
                ...album.mainPhoto,
                url: urlResult.url.toString(),
                thumbnailUrl: thumbnailUrl, // ✅ Amplify署名付きURLを使用
              },
            };
          } catch (error) {
            console.error(`URL生成エラー - Album: ${album.albumId}`, error);
            return {
              ...album,
              mainPhotoUrl: "",
              mainPhoto: {
                ...album.mainPhoto,
                url: "",
                thumbnailUrl: null,
              },
            };
          }
        })
      );

      // Step 2以降は既存のまま...
      let albumsWithFavorites = albumsWithUrls;

      if (userInfo?.passcode) {
        try {
          const albumIds = albumsWithUrls.map((album) => album.albumId);

          if (albumIds.length > 0) {
            const favResponse = await fetch(`${API_BASE}/favorites/batch`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: userInfo.passcode,
                albumIds: albumIds,
              }),
            });

            if (favResponse.ok) {
              const favResult = await favResponse.json();

              if (favResult.success) {
                albumsWithFavorites = albumsWithUrls.map((album) => ({
                  ...album,
                  favoriteCount: favResult.results[album.albumId]?.favoriteCount || 0,
                  isFavorite: favResult.results[album.albumId]?.isFavorite || false,
                }));
              }
            }
          }
        } catch (error) {
          console.error("お気に入り情報取得エラー:", error);
        }
      }

      setAlbums(albumsWithFavorites);
      console.log(`✅ ${albumsWithFavorites.length}個のアルバムを表示`);
    } catch (error) {
      console.error("アルバム取得エラー:", error);
      setAlbums([]);
    } finally {
      setLoading(false);
    }
  }, [userInfo?.passcode]);

  // アルバム写真を読み込み（メモ化）
  // ===============================================
  // 🔄 修正版：loadAlbumPhotos関数（2回のAPI呼び出し）
  // ===============================================

  const loadAlbumPhotos = useCallback(
    async (album: Album) => {
      try {
        console.log(`📸 アルバム詳細読み込み開始: ${album.albumId.substring(0, 8)}...`);

        // ✅ Step 1: 写真URL生成（既存処理）
        const photosWithUrls = await Promise.all(
          album.photos.map(async (photo) => {
            try {
              const urlResult = await getUrl({ key: photo.s3Key });
              return { ...photo, url: urlResult.url.toString() };
            } catch (error) {
              console.error("Error getting photo URL:", error);
              return { ...photo, url: undefined };
            }
          })
        );

        const validPhotos = photosWithUrls.filter((photo) => photo.url);

        // 🔥 まず基本情報で即座に表示（既存のお気に入り情報を使用）
        setSelectedAlbum({
          ...album,
          photos: validPhotos,
          favoriteCount: album.favoriteCount || 0, // 既存データを使用
          isFavorite: album.isFavorite || false, // 既存データを使用
          isPublic: album.isPublic !== false,
        });
        setCurrentPhotoIndex(0);

        console.log(`✅ アルバム基本情報表示完了`);

        // ✅ Step 2: バッチAPIで最新のお気に入り情報を取得（バックグラウンド）
        if (userInfo?.passcode) {
          try {
            const batchResponse = await fetch(`${API_BASE}/favorites/batch`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: userInfo.passcode,
                albumIds: [album.albumId], // 1件だけのバッチ取得
              }),
            });

            if (batchResponse.ok) {
              const batchResult = await batchResponse.json();

              if (batchResult.success && batchResult.results[album.albumId]) {
                const latestData = batchResult.results[album.albumId];

                // 🔄 最新情報で詳細画面を更新
                setSelectedAlbum((prev) =>
                  prev
                    ? {
                        ...prev,
                        favoriteCount: latestData.favoriteCount,
                        isFavorite: latestData.isFavorite,
                      }
                    : null
                );

                // 🔄 アルバム一覧の該当項目も更新
                setAlbums((prevAlbums) =>
                  prevAlbums.map((prevAlbum) =>
                    prevAlbum.albumId === album.albumId
                      ? {
                          ...prevAlbum,
                          favoriteCount: latestData.favoriteCount,
                          isFavorite: latestData.isFavorite,
                        }
                      : prevAlbum
                  )
                );
              } else {
                console.warn("バッチAPI結果が空でした");
              }
            } else {
              console.warn(`バッチAPI呼び出しエラー: ${batchResponse.status}`);
            }
          } catch (batchError) {
            console.error("バッチAPI取得エラー:", batchError);
            // エラーでも詳細画面は表示済みなので継続
          }
        }
      } catch (error) {
        console.error("Error loading album photos:", error);
        // エラーでも基本的なアルバム情報は表示
        setSelectedAlbum({
          ...album,
          photos: [],
          favoriteCount: album.favoriteCount || 0,
          isFavorite: album.isFavorite || false,
          isPublic: album.isPublic !== false,
        });
        setCurrentPhotoIndex(0);
      }
    },
    [userInfo?.passcode, API_BASE, setSelectedAlbum, setCurrentPhotoIndex, setAlbums]
  );

  // ===============================================
  // 🆕 お気に入り状態の再同期関数
  // ===============================================

  const refreshFavoriteStatus = useCallback(
    async (targetId: string) => {
      if (!userInfo?.passcode) return;

      console.log(`🔄 お気に入り状態を再同期: ${targetId.substring(0, 8)}...`);

      try {
        const batchResponse = await fetch(`${API_BASE}/favorites/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userInfo.passcode,
            albumIds: [targetId],
          }),
        });

        if (batchResponse.ok) {
          const batchResult = await batchResponse.json();

          if (batchResult.success && batchResult.results[targetId]) {
            const latestData = batchResult.results[targetId];

            // アルバム一覧を更新
            setAlbums((prevAlbums) =>
              prevAlbums.map((album) =>
                album.albumId === targetId
                  ? {
                      ...album,
                      isFavorite: latestData.isFavorite,
                      favoriteCount: latestData.favoriteCount,
                    }
                  : album
              )
            );

            // 詳細画面も更新
            if (selectedAlbum && selectedAlbum.albumId === targetId) {
              setSelectedAlbum((prev) =>
                prev
                  ? {
                      ...prev,
                      isFavorite: latestData.isFavorite,
                      favoriteCount: latestData.favoriteCount,
                    }
                  : null
              );
            }

            console.log(`✅ 状態同期完了`);
          } else {
            console.warn("⚠️ バッチAPI結果が空");
          }
        } else {
          console.warn(`⚠️ バッチAPI呼び出し失敗: ${batchResponse.status}`);
        }
      } catch (error) {
        console.error("❌ 状態同期エラー:", error);
      }
    },
    [API_BASE, userInfo?.passcode, selectedAlbum]
  );

  // お気に入り切り替え（メモ化）
  // ===============================================
  // 🔧 改善版：toggleFavorite関数（エラーハンドリング強化）
  // ===============================================

  const toggleFavorite = useCallback(
    async (targetType: string, targetId: string): Promise<boolean> => {
      if (!userInfo?.passcode) return false;

      setFavoriteLoading(true);

      // 現在の状態を確認
      const currentAlbum = albums.find((album) => album.albumId === targetId);
      const currentStatus = currentAlbum?.isFavorite || false;
      const action = currentStatus ? "remove" : "add";

      try {
        // ✅ Step 1: お気に入り追加/削除API呼び出し
        const response = await fetch(`${API_BASE}/favorites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userInfo.passcode,
            targetType: targetType,
            targetId: targetId,
            action: action,
          }),
        });

        const result = await response.json();

        // 🔧 重複エラーの適切な処理
        if (!response.ok || !result.success) {
          if (response.status === 409 || result.message?.includes("すでにお気に入り")) {
            console.log(`⚠️ 重複検出: ${targetId.substring(0, 8)}... は既にお気に入り済み`);

            // 重複の場合は、現在の状態を「お気に入り済み」に強制的に更新
            const correctedStatus = true;

            setAlbums((prevAlbums) => prevAlbums.map((album) => (album.albumId === targetId ? { ...album, isFavorite: correctedStatus } : album)));

            if (selectedAlbum && selectedAlbum.albumId === targetId) {
              setSelectedAlbum((prev) => (prev ? { ...prev, isFavorite: correctedStatus } : null));
            }

            // ✅ 最新情報を再取得して同期
            await refreshFavoriteStatus(targetId);
            return correctedStatus;
          }

          // その他のエラー
          console.warn(`❌ お気に入り操作エラー:`, result.message || `HTTP ${response.status}`);
          return currentStatus; // 元の状態を維持
        }

        console.log(`✅ お気に入り${action}API成功`);

        // ✅ Step 2: 最新状態をバッチAPIで確認
        await refreshFavoriteStatus(targetId);

        return !currentStatus; // 成功時は状態を反転
      } catch (error) {
        console.error("❌ お気に入り切り替えエラー:", error);
        return currentStatus; // エラー時は元の状態を維持
      } finally {
        setFavoriteLoading(false);
      }
    },
    [API_BASE, userInfo?.passcode, albums, selectedAlbum]
  );

  // 表示切り替え（メモ化）
  const toggleVisibility = useCallback(
    async (albumId: string, currentStatus: boolean): Promise<boolean> => {
      if (!userInfo?.passcode) return currentStatus;

      setVisibilityLoading(true);

      try {
        const response = await fetch(`${API_BASE}/photos/album/${albumId}/visibility`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isPublic: !currentStatus,
            passcode: userInfo.passcode,
          }),
        });

        if (!response.ok) {
          console.warn(`Toggle visibility API returned ${response.status}`);
          return currentStatus;
        }

        const result = await response.json();

        if (result.success) {
          if (selectedAlbum && selectedAlbum.albumId === albumId) {
            setSelectedAlbum((prev) => (prev ? { ...prev, isPublic: !currentStatus } : null));
          }

          fetchAlbums().catch((err) => console.warn("Error refreshing albums:", err));
          return !currentStatus;
        }

        return currentStatus;
      } catch (error) {
        console.error("Error toggling visibility:", error);
        alert("削除/復元の切り替えに失敗しました。もう一度お試しください。");
        return currentStatus;
      } finally {
        setVisibilityLoading(false);
      }
    },
    [userInfo?.passcode, API_BASE, selectedAlbum, fetchAlbums]
  );

  // ユーザー権限チェック（メモ化）
  const isOwner = useCallback(
    (album: Album): boolean => {
      return userInfo?.passcode === album.uploadedBy;
    },
    [userInfo?.passcode]
  );

  // イベントハンドラー（メモ化）
  const handleAlbumClick = useCallback(
    (album: Album) => {
      loadAlbumPhotos(album);
    },
    [loadAlbumPhotos]
  );

  const handleThumbnailClick = useCallback((index: number) => {
    setCurrentPhotoIndex(index);
  }, []);

  // ✅ 修正後：クライアントサイドでソート
  const handleSortChange = useCallback(
    (newSortType: SortType) => {
      setSortType(newSortType);

      // 既存のalbumsをソート
      setAlbums((prevAlbums) => {
        return sortAlbums(prevAlbums, newSortType);
      });
    },
    [sortAlbums]
  );

  const handleCloseModal = useCallback(() => {
    if (selectedAlbum && selectedAlbum.isPublic === false && isOwner(selectedAlbum)) {
      setShowConfirmDialog(true);
    } else {
      setSelectedAlbum(null);
    }
  }, [selectedAlbum, isOwner]);

  const handleConfirmClose = useCallback(() => {
    setShowConfirmDialog(false);
    setSelectedAlbum(null);
  }, []);

  const handleCancelClose = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  const nextPhoto = useCallback(() => {
    if (selectedAlbum && currentPhotoIndex < selectedAlbum.photos.length - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
    }
  }, [selectedAlbum, currentPhotoIndex]);

  const prevPhoto = useCallback(() => {
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex(currentPhotoIndex - 1);
    }
  }, [currentPhotoIndex]);

  // エフェクト
  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums, refreshTrigger]);

  // レンダリング
  if (loading) {
    return <LoadingState />;
  }

  if (albums.length === 0) {
    return <EmptyState mediaFilter={mediaFilter} isAlbumsEmpty={true} />;
  }

  return (
    <>
      {/* フィルターヘッダー */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-gray-200/50 px-4 py-3">
        <div className="flex justify-center space-x-2">
          <button
            onClick={() => setMediaFilter("all")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              mediaFilter === "all" ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t("all")}
          </button>
          <button
            onClick={() => setMediaFilter("photo")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center space-x-1 ${
              mediaFilter === "photo" ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>{t("photo")}</span>
          </button>
          <button
            onClick={() => setMediaFilter("video")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center space-x-1 ${
              mediaFilter === "video" ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span>{t("video")}</span>
          </button>
        </div>
      </div>

      {/* ソートボタン */}
      <div className="fixed bottom-4 left-4 z-40">
        <div className="bg-white rounded-lg shadow-lg border p-1 flex">
          <button
            onClick={() => handleSortChange("date")}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              sortType === "date" ? "bg-pink-500 text-white shadow-sm" : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>{t("post_order")}</span>
            </div>
          </button>
          <button
            onClick={() => handleSortChange("favorites")}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              sortType === "favorites" ? "bg-pink-500 text-white shadow-sm" : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span>{t("popularity_order")}</span>
            </div>
          </button>
        </div>
      </div>

      {/* アルバム一覧 */}
      {sortedFilteredAlbums.length === 0 ? (
        <EmptyState mediaFilter={mediaFilter} />
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mx-2 mt-2 pb-20">
          {sortedFilteredAlbums.map((album) => (
            <AlbumItem key={album.albumId} album={album} onClick={() => handleAlbumClick(album)} isOwner={isOwner} />
          ))}
        </div>
      )}

      {/* モーダル */}
      {selectedAlbum && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            {/* ヘッダー */}
            <div className="flex justify-between items-center p-4">
              <div className="text-white">
                <p className="font-semibold text-lg">{selectedAlbum.uploaderName || selectedAlbum.uploadedBy}</p>
                <p className="text-sm opacity-80">
                  {new Date(selectedAlbum.uploadedAt).toLocaleDateString(language === "ja" ? "ja-JP" : "en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {selectedAlbum.totalPhotos > 1 && (
                    <span className="ml-2">
                      • {currentPhotoIndex + 1}/{selectedAlbum.totalPhotos}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center space-x-3">
                {/* 削除/復元ボタン */}
                {isOwner(selectedAlbum) && (
                  <button
                    onClick={() => toggleVisibility(selectedAlbum.albumId, selectedAlbum.isPublic !== false)}
                    disabled={visibilityLoading}
                    className={`w-10 h-10 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors ${
                      selectedAlbum.isPublic !== false
                        ? "bg-gray-500/80 hover:bg-gray-600/80 text-white hover:bg-red-600/80"
                        : "bg-blue-500/80 text-white hover:bg-blue-600/80"
                    } ${visibilityLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                    title={selectedAlbum.isPublic !== false ? "削除（他のユーザーに非表示）" : "復元（再表示）"}
                  >
                    {visibilityLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : selectedAlbum.isPublic !== false ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    )}
                  </button>
                )}

                {/* お気に入りボタン */}
                <button
                  onClick={() => toggleFavorite("album", selectedAlbum.albumId)}
                  disabled={favoriteLoading}
                  className={`w-10 h-10 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors ${
                    selectedAlbum.isFavorite ? "bg-red-500/80 text-white hover:bg-red-600/80" : "bg-white/20 text-white hover:bg-white/30"
                  } ${favoriteLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {favoriteLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-5 h-5" fill={selectedAlbum.isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                  )}
                </button>

                {/* 閉じるボタン */}
                <button
                  onClick={handleCloseModal}
                  className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* メイン表示 */}
            <div className="relative px-4 py-2 flex items-center justify-center">
              <div className="relative max-w-full">
                {selectedAlbum.photos[currentPhotoIndex]?.mediaType === "video" ? (
                  <video src={selectedAlbum.photos[currentPhotoIndex]?.url} className="max-w-full max-h-[80vh] object-contain mx-auto" controls muted />
                ) : (
                  <img
                    src={selectedAlbum.photos[currentPhotoIndex]?.url}
                    alt={selectedAlbum.caption || "Wedding photo"}
                    className="max-w-full max-h-[80vh] object-contain mx-auto"
                  />
                )}

                {/* ナビゲーション */}
                {selectedAlbum.totalPhotos > 1 && currentPhotoIndex > 0 && (
                  <button
                    onClick={prevPhoto}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}

                {selectedAlbum.totalPhotos > 1 && currentPhotoIndex < selectedAlbum.totalPhotos - 1 && (
                  <button
                    onClick={nextPhoto}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* サムネイル */}
            {selectedAlbum.totalPhotos > 1 && (
              <div className="px-4 py-2">
                <div className="max-w-4xl mx-auto">
                  <div className="flex justify-center">
                    <div className="flex space-x-2 overflow-x-auto p-2 max-w-full">
                      {selectedAlbum.photos.map((photo, index) => (
                        <ThumbnailItem
                          key={photo.photoId}
                          photo={photo}
                          index={index}
                          isSelected={currentPhotoIndex === index}
                          onClick={() => handleThumbnailClick(index)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* キャプション */}
            {selectedAlbum.caption && (
              <div className="px-4 py-4">
                <div className="bg-gradient-to-r from-pink-500/90 to-rose-500/90 backdrop-blur-sm rounded-2xl px-2 py-4 shadow-lg max-w-2xl mx-auto">
                  <p className="text-white text-sm font-medium text-center leading-relaxed whitespace-pre-wrap">{selectedAlbum.caption}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 確認ダイアログ */}
      <ConfirmDialog isOpen={showConfirmDialog} onConfirm={handleConfirmClose} onCancel={handleCancelClose} />
    </>
  );
}
