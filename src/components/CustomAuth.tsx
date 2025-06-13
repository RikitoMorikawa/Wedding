'use client'

import { useState } from 'react'
import { signIn } from 'aws-amplify/auth'

interface CustomAuthProps {
  onAuthSuccess: () => void
}

export default function CustomAuth({ onAuthSuccess }: CustomAuthProps) {
  const [passcode, setPasscode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!passcode.trim()) {
      setError('パスコードを入力してください')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      console.log('=== CustomAuth: Starting login ===')
      console.log('Attempting to sign in with passcode:', passcode)
      
      const result = await signIn({
        username: passcode,
        password: passcode
      })
      
      console.log('Sign in result:', result)
      
      if (result.isSignedIn) {
        console.log('✅ CustomAuth: Login successful')
        onAuthSuccess()
      } else {
        console.log('❌ CustomAuth: Login incomplete:', result.nextStep)
        setError('ログインが完了しませんでした')
      }
    } catch (error: any) {
      console.error('CustomAuth: Login error:', error)
      
      if (error.name === 'NotAuthorizedException') {
        setError('パスコードが正しくありません')
      } else if (error.name === 'UserNotFoundException') {
        setError('ユーザーが見つかりません')
      } else {
        setError('ログインエラーが発生しました')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-pink-100 to-purple-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          結婚式写真共有
        </h1>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="passcode" className="block text-sm font-medium text-gray-700 mb-2">
              パスコード
            </label>
            <input
              type="text"
              id="passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
              placeholder="パスコードを入力"
              required
              disabled={isLoading}
            />
          </div>
          
          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-2 px-4 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}
