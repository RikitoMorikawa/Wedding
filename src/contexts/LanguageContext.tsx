"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Language = "ja" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

interface Translations {
  [key: string]: {
    [key in Language]: string;
  };
}

const translations: Translations = {
  // 共通
  loading: {
    ja: "読み込み中...",
    en: "Loading...",
  },
  login: {
    ja: "ログイン",
    en: "Login",
  },
  logout: {
    ja: "ログアウト",
    en: "Logout",
  },
  register: {
    ja: "登録",
    en: "Register",
  },
  name: {
    ja: "お名前",
    en: "Name",
  },
  required: {
    ja: "*",
    en: "*",
  },

  // CustomAuth関連
  wedding_memories: {
    ja: "Wedding Memories",
    en: "Wedding Memories",
  },
  wedding_photo_sharing: {
    ja: "結婚式写真共有",
    en: "Wedding Photo Sharing",
  },
  invitation_code: {
    ja: "招待コード",
    en: "Invitation Code",
  },
  enter_invitation_code: {
    ja: "招待コードを入力",
    en: "Enter invitation code",
  },
  enter_6_digit_passcode: {
    ja: "6文字のパスコードを入力してください",
    en: "Please enter a 6-digit passcode",
  },
  incorrect_passcode: {
    ja: "パスコードが正しくありません",
    en: "Incorrect passcode",
  },
  user_not_found: {
    ja: "ユーザーが見つかりません",
    en: "User not found",
  },
  login_error: {
    ja: "ログインエラーが発生しました",
    en: "Login error occurred",
  },
  login_incomplete: {
    ja: "ログインが完了しませんでした",
    en: "Login was not completed",
  },
  logging_in: {
    ja: "ログイン中...",
    en: "Logging in...",
  },
  special_day_memory: {
    ja: "特別な日の思い出を\nみんなで共有しましょう 💕",
    en: "Share memories of your\nspecial day together 💕",
  },

  // UserRegistrationModal関連
  user_registration: {
    ja: "ユーザー情報登録",
    en: "User Registration",
  },
  logged_in_with_code: {
    ja: "でログインしました",
    en: "Logged in successfully",
  },
  register_name_start: {
    ja: "お名前を登録して\n写真共有を始めましょう!",
    en: "Register your name and\nstart sharing photos!",
  },
  name_example: {
    ja: "例：田中太郎",
    en: "e.g., John Smith",
  },
  enter_name: {
    ja: "名前を入力してください",
    en: "Please enter your name",
  },
  registration_failed: {
    ja: "登録に失敗しました。もう一度お試しください。",
    en: "Registration failed. Please try again.",
  },
  registering: {
    ja: "登録中...",
    en: "Registering...",
  },

  // PhotoGallery関連
  photo: {
    ja: "写真",
    en: "Photo",
  },
  video: {
    ja: "動画",
    en: "Video",
  },
  image: {
    ja: "画像",
    en: "Image",
  },
  deleted: {
    ja: "削除済み",
    en: "Deleted",
  },
  loading_photos: {
    ja: "写真を読み込み中...",
    en: "Loading photos...",
  },
  no_photos_yet: {
    ja: "まだ写真がありません",
    en: "No photos yet",
  },
  upload_first_photo: {
    ja: "最初の写真をアップロードしてみましょう！",
    en: "Upload your first photo!",
  },
  no_photos_uploaded: {
    ja: "まだ写真がアップロードされていません",
    en: "No photos uploaded yet",
  },
  no_photos_found: {
    ja: "写真がありません",
    en: "No photos found",
  },
  no_videos_found: {
    ja: "動画がありません",
    en: "No videos found",
  },
  share_first_memory: {
    ja: "最初の思い出を共有してみましょう！",
    en: "Let's share your first memory!",
  },
  try_other_media_types: {
    ja: "他のメディアタイプを確認してみてください",
    en: "Try checking other media types",
  },
  all: {
    ja: "すべて",
    en: "All",
  },

  // PhotoUploadModal関連
  post_order: {
    ja: "投稿順",
    en: "Date",
  },
  popularity_order: {
    ja: "人気順",
    en: "Popular",
  },

  // cpnfirmation関連
  deleted_photo_confirmation: {
    ja: "削除済み写真の確認",
    en: "Deleted Photo Confirmation",
  },
  photo_is_deleted: {
    ja: "この写真は削除済みです。",
    en: "This photo has been deleted.",
  },
  cannot_restore_after_close: {
    ja: "画面を閉じると、\nこの投稿は復元できません。",
    en: "Once you close this screen,\nthis post cannot be restored.",
  },
  really_close_modal: {
    ja: "本当にモーダルを閉じますか？",
    en: "Are you sure you want to close this modal?",
  },
  cancel: {
    ja: "キャンセル",
    en: "Cancel",
  },
  close: {
    ja: "閉じる",
    en: "Close",
  },
  photo_confirmation: {
    ja: "写真の確認",
    en: "Photo Confirmation",
  },
  wedding_photo_question: {
    ja: "この写真は本日の結婚式で撮影したものですか？",
    en: "Was this photo taken at today's wedding?",
  },
  wedding_only_notice: {
    ja: "結婚式に関係のない写真の投稿はご遠慮ください。",
    en: "Please refrain from posting photos unrelated to the wedding.",
  },
  no: {
    ja: "いいえ",
    en: "No",
  },
  yes: {
    ja: "はい",
    en: "Yes",
  },

  // PhotoUpload関連
  select_files: {
    ja: "を選択",
    en: "Select",
  },
  tap_to_select: {
    ja: "をタップして選択",
    en: "Tap to select",
  },
  add_more: {
    ja: "追加選択",
    en: "Add more",
  },
  photo_files_only: {
    ja: "写真ファイルのみ選択できます",
    en: "Only photo files can be selected",
  },
  video_files_only: {
    ja: "動画ファイルのみ選択できます",
    en: "Only video files can be selected",
  },
  select_file_type: {
    ja: "ファイルを選択してください",
    en: "Please select files",
  },
  file_count_limit: {
    ja: "は最大{max}個まで選択できます",
    en: "Maximum {max} files can be selected",
  },
  current_count: {
    ja: "現在: {current}個",
    en: "Current: {current}",
  },
  adding_count: {
    ja: "追加しようとした数: {adding}個",
    en: "Trying to add: {adding}",
  },
  limit_count: {
    ja: "制限: {limit}個",
    en: "Limit: {limit}",
  },
  file_size_limit: {
    ja: "ファイルは{size}以下にしてください",
    en: "Files must be {size} or smaller",
  },
  pro_photo_support: {
    ja: "（プロ撮影・高画質対応）",
    en: "(Professional/High quality support)",
  },
  video_duration_support: {
    ja: "（約1-2分の動画対応）",
    en: "(1-2 minute video support)",
  },
  files_too_large: {
    ja: "大きすぎるファイル:",
    en: "Files too large:",
  },
  total_size_exceeded: {
    ja: "合計ファイルサイズが制限を超えています",
    en: "Total file size exceeds limit",
  },
  current_total: {
    ja: "現在の合計: {size}MB",
    en: "Current total: {size}MB",
  },
  size_limit: {
    ja: "制限: {limit}MB",
    en: "Limit: {limit}MB",
  },
  reduce_files_message: {
    ja: "ファイル数を減らすか、より小さなファイルを選択してください",
    en: "Please reduce the number of files or select smaller files",
  },
  main_photo: {
    ja: "（メイン写真）",
    en: "(Main photo)",
  },
  main_video: {
    ja: "（メイン動画）",
    en: "(Main video)",
  },
  comment_optional: {
    ja: "コメント（任意）",
    en: "Comment (Optional)",
  },
  album_comment_note: {
    ja: "※アルバム全体のコメントです",
    en: "* Comment for the entire album",
  },
  album_comment_placeholder: {
    ja: "このアルバムについて一言...",
    en: "A word about this album...",
  },
  single_comment_placeholder: {
    ja: "について一言...",
    en: "A word about this",
  },
  uploading: {
    ja: "アップロード中...",
    en: "Uploading...",
  },
  upload_files: {
    ja: "をアップロード",
    en: "Upload",
  },
  bulk_upload: {
    ja: "個を一括アップロード",
    en: "Bulk upload",
  },
  upload_error: {
    ja: "アップロードエラー",
    en: "Upload Error",
  },
  duplicate_error: {
    ja: "重複エラー\n同じファイルが既に存在します。しばらく待ってから再試行してください。",
    en: "Duplicate Error\nThe same file already exists. Please wait and try again.",
  },
  server_overload_error: {
    ja: "サーバー負荷エラー\nサーバーが一時的に混雑しています。少し待ってから再試行してください。",
    en: "Server Overload Error\nThe server is temporarily busy. Please wait and try again.",
  },
  unexpected_error: {
    ja: "予期しないエラーが発生しました",
    en: "An unexpected error occurred",
  },
  file_formats_photo: {
    ja: "JPG, PNG, GIF, WebP（最大50MB/枚）",
    en: "JPG, PNG, GIF, WebP (Max 50MB each)",
  },
  file_formats_video: {
    ja: "MP4, MOV, AVI, WebM（最大200MB/枚）",
    en: "MP4, MOV, AVI, WebM (Max 200MB each)",
  },
  max_files_total_size: {
    ja: "最大{maxFiles}個 | 合計{totalSize}MB",
    en: "Max {maxFiles} files | Total {totalSize}MB",
  },
  selected_files: {
    ja: "選択中の",
    en: "Selected",
  },
  files_count: {
    ja: "個",
    en: "files",
  },
  limit_reached: {
    ja: "制限に達しました",
    en: "Limit reached",
  },
  remove_all: {
    ja: "すべて削除",
    en: "Remove All",
  },
  add_files: {
    ja: "を追加",
    en: "Add more",
  },
  please_select: {
    ja: "を選択してください",
    en: "Please select",
  },

  // エラーメッセージ関連
  file_count_limit_simple: {
    ja: "まで",
    en: "max",
  },
  file_size_limit_simple: {
    ja: "まで",
    en: "max",
  },
  total_size_limit_simple: {
    ja: "合計",
    en: "Total",
  },
  count_over: {
    ja: "枚数オーバー",
    en: "Too many files",
  },
  size_over: {
    ja: "サイズオーバー",
    en: "Size exceeded",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ja");

  // ローカルストレージから言語設定を読み込み
  useEffect(() => {
    const savedLanguage = localStorage.getItem("wedding-app-language") as Language;
    if (savedLanguage && (savedLanguage === "ja" || savedLanguage === "en")) {
      setLanguageState(savedLanguage);
    }
  }, []);

  // 言語変更時にローカルストレージに保存
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("wedding-app-language", lang);
  };

  // 翻訳関数
  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
