import React, { useState } from 'react';
import { HeartIcon } from '@heroicons/react/24/solid';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { UserRole } from '../types';


const LoginPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<UserRole>(UserRole.Hospital);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged in App.tsx will handle the redirect
    } catch (err: any) {
        switch (err.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                setError('Email hoặc mật khẩu không chính xác.');
                break;
            case 'auth/invalid-email':
                setError('Địa chỉ email không hợp lệ.');
                break;
            default:
                setError('Đã xảy ra lỗi. Vui lòng thử lại.');
                break;
        }
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <div className="text-center">
            <HeartIcon className="w-12 h-12 mx-auto text-red-500" />
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Đăng nhập Hệ thống</h1>
          <p className="text-gray-600">Chào mừng bạn trở lại!</p>
        </div>

        <div>
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab(UserRole.Hospital)}
              className={`w-1/2 py-2 text-sm font-medium ${activeTab === UserRole.Hospital ? 'border-b-2 border-red-500 text-red-600' : 'text-gray-500'}`}
            >
              {UserRole.Hospital}
            </button>
            <button
              onClick={() => setActiveTab(UserRole.Admin)}
              className={`w-1/2 py-2 text-sm font-medium ${activeTab === UserRole.Admin ? 'border-b-2 border-red-500 text-red-600' : 'text-gray-500'}`}
            >
              {UserRole.Admin}
            </button>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password"className="text-sm font-medium text-gray-700">Mật khẩu</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500"
              placeholder="••••••••"
            />
          </div>
           {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-400"
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;