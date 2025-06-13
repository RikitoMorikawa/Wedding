'use client'

import { useState } from 'react'

interface UserRegistrationModalProps {
  passcode: string
  onRegister: (name: string) => void
  onLogout: () => void
}

export default function UserRegistrationModal({ 
  passcode, 
  onRegister, 
  onLogout 
}: UserRegistrationModalProps) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      alert('名前を入力してください')
      return
    }

    setLoading(true)
    try {
      await onRegister(name.trim())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ユーザー情報登録</h2>
          <p className="text-gray-600">
            パスコード「{passcode}」のユーザー情報が見つかりません。
            <br />
            お名前を登録してください。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              お名前 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：田中太郎"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onLogout}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              ログアウト
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className={`flex-1 py-2 px-4 rounded-md font-medium text-white ${
                loading || !name.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              {loading ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
