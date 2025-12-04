import React, { useState, useEffect, useRef } from 'react';
import { HeartIcon, MapPinIcon, CheckBadgeIcon } from '@heroicons/react/24/solid';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { UserRole, HospitalStatus, UserStatus } from '../types';
import Modal from '../components/Modal';
import { doc, writeBatch, getDoc } from 'firebase/firestore';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';

// Component to handle map center updates
const MapController = ({ onCenterChange }: { onCenterChange: (lat: number, lng: number) => void }) => {
    const map = useMapEvents({
        moveend: () => {
            const center = map.getCenter();
            onCenterChange(center.lat, center.lng);
        },
        // Setup initial user location
        locationfound(e) {
            map.flyTo(e.latlng, 15);
            onCenterChange(e.latlng.lat, e.latlng.lng);
        },
    });

    useEffect(() => {
        map.locate();
    }, [map]);

    return null;
};

const LoginPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<UserRole>(UserRole.Hospital);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Registration State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [newHospital, setNewHospital] = useState({
    name: '',
    address: '',
    email: '',
    password: '',
    licenseUrl: '',
    lat: 10.762622, // Default Lat (HCMC)
    lng: 106.660172, // Default Lng (HCMC)
  });

  const handleTabClick = (tab: UserRole) => {
    setActiveTab(tab);
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (userData.status === UserStatus.Locked) {
              await signOut(auth);
              setError("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên để biết thêm chi tiết.");
              setLoading(false);
              return;
          }
      }
    } catch (err: any) {
        setLoading(false);
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
    }
  };

  const handleRegisterHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    setRegisterLoading(true);

    if (newHospital.password.length < 6) {
        setRegisterError("Mật khẩu phải có ít nhất 6 ký tự.");
        setRegisterLoading(false);
        return;
    }

    if (!newHospital.licenseUrl) {
        setRegisterError("Vui lòng cung cấp link giấy phép hoạt động.");
        setRegisterLoading(false);
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, newHospital.email, newHospital.password);
        const uid = userCredential.user.uid;
        
        const batch = writeBatch(db);
        
        const hospitalRef = doc(db, 'hospitals', uid);
        batch.set(hospitalRef, { 
            name: newHospital.name, 
            address: newHospital.address, 
            licenseUrl: newHospital.licenseUrl, 
            status: HospitalStatus.Pending,
            location: {
                lat: newHospital.lat,
                lng: newHospital.lng
            }
        });

        const roleRef = doc(db, 'user_roles', uid);
        batch.set(roleRef, { role: UserRole.Hospital });

        const userRef = doc(db, 'users', uid);
        batch.set(userRef, {
            uid: uid,
            fullName: newHospital.name,
            email: newHospital.email,
            status: UserStatus.Active,
            lastDonationDate: null
        });

        await batch.commit();
        
        setIsRegisterModalOpen(false);
        setNewHospital({
            name: '', address: '', email: '', password: '', licenseUrl: '', 
            lat: 10.762622, lng: 106.660172
        });
        alert('Đăng ký thành công! Vui lòng chờ quản trị viên duyệt hồ sơ của bạn.');
        
    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
            setRegisterError('Địa chỉ email này đã được sử dụng.');
        } else if (error.code === 'auth/invalid-email') {
            setRegisterError('Địa chỉ email không hợp lệ.');
        } else {
            setRegisterError('Đã xảy ra lỗi khi tạo tài khoản. Vui lòng thử lại.');
            console.error("Error creating hospital account: ", error);
        }
    } finally {
        setRegisterLoading(false);
    }
  };

  const onMapCenterChange = (lat: number, lng: number) => {
      setNewHospital(prev => ({...prev, lat, lng}));
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Side - Illustration */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-red-600 overflow-hidden flex-col justify-between p-12 text-white">
         <div className="absolute inset-0 bg-gradient-to-br from-red-700 to-red-500 opacity-90"></div>
         <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
         
         <div className="absolute top-[-10%] right-[-10%] w-96 h-96 rounded-full bg-white opacity-10 blur-3xl animate-pulse"></div>
         <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 rounded-full bg-red-900 opacity-20 blur-3xl"></div>

         <div className="relative z-10 animate-fade-in-up">
            <div className="flex items-center space-x-3 mb-8">
                <div className="p-2 bg-white rounded-lg bg-opacity-20 backdrop-blur-sm shadow-inner">
                    <HeartIcon className="w-8 h-8 text-white" />
                </div>
                <span className="text-xl font-bold tracking-wider uppercase drop-shadow-sm">Smart Blood Donation</span>
            </div>
            <h1 className="text-5xl font-extrabold leading-tight mb-6 drop-shadow-md">Kết nối sự sống,<br/>Lan tỏa yêu thương.</h1>
            <p className="text-lg text-red-100 max-w-md font-medium">Hệ thống quản lý hiến máu thông minh giúp tối ưu hóa quy trình, kết nối người hiến và bệnh viện một cách nhanh chóng.</p>
         </div>

         <div className="relative z-10 grid grid-cols-2 gap-6 mt-12 animate-fade-in-up delay-200">
             <div className="bg-white bg-opacity-10 p-5 rounded-2xl backdrop-blur-md border border-white border-opacity-20 hover:bg-opacity-20 transition-all duration-300">
                 <CheckBadgeIcon className="w-8 h-8 mb-3 text-red-100" />
                 <h3 className="font-bold text-lg mb-1">Quản lý Tập trung</h3>
                 <p className="text-sm text-red-100 opacity-90">Theo dõi toàn bộ lịch hẹn và yêu cầu máu.</p>
             </div>
             <div className="bg-white bg-opacity-10 p-5 rounded-2xl backdrop-blur-md border border-white border-opacity-20 hover:bg-opacity-20 transition-all duration-300">
                 <MapPinIcon className="w-8 h-8 mb-3 text-red-100" />
                 <h3 className="font-bold text-lg mb-1">Bản đồ Trực quan</h3>
                 <p className="text-sm text-red-100 opacity-90">Định vị và điều phối nguồn lực hiệu quả.</p>
             </div>
         </div>
         
         <div className="relative z-10 text-xs text-red-200 mt-12 opacity-70">
             © 2025 Smart Blood Donation Portal. All rights reserved.
         </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16 relative bg-gray-50/50 z-10">
         <div className="w-full max-w-md space-y-8 bg-white p-8 sm:p-10 rounded-2xl shadow-xl lg:shadow-none lg:bg-transparent animate-fade-in-up delay-100 relative">
            <div className="text-center lg:text-left">
                <div className="lg:hidden flex justify-center mb-4">
                     <div className="p-3 bg-red-50 rounded-full">
                        <HeartIcon className="w-10 h-10 text-red-600" />
                     </div>
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Đăng nhập</h2>
                <p className="mt-3 text-sm text-gray-500">
                    Chào mừng bạn quay trở lại. Vui lòng chọn vai trò để tiếp tục.
                </p>
            </div>

            <div className="space-y-6">
                <div className="bg-gray-100 p-1.5 rounded-xl flex shadow-inner">
                    <button
                        onClick={() => handleTabClick(UserRole.Hospital)}
                        className={`w-1/2 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 ease-out ${activeTab === UserRole.Hospital ? 'bg-white text-red-600 shadow-sm scale-100' : 'text-gray-500 hover:text-gray-700 scale-95'}`}
                    >
                        {UserRole.Hospital}
                    </button>
                    <button
                        onClick={() => handleTabClick(UserRole.Admin)}
                        className={`w-1/2 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 ease-out ${activeTab === UserRole.Admin ? 'bg-white text-red-600 shadow-sm scale-100' : 'text-gray-500 hover:text-gray-700 scale-95'}`}
                    >
                        {UserRole.Admin}
                    </button>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="block w-full px-4 py-3.5 text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:ring-4 focus:ring-red-500/10 focus:border-red-500 sm:text-sm transition-all duration-200 ease-in-out bg-white hover:bg-gray-50/50 focus:bg-white"
                            placeholder="name@hospital.com"
                        />
                    </div>
                    <div>
                        <label htmlFor="password"className="block text-sm font-semibold text-gray-700 mb-1.5">Mật khẩu</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="block w-full px-4 py-3.5 text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:ring-4 focus:ring-red-500/10 focus:border-red-500 sm:text-sm transition-all duration-200 ease-in-out bg-white hover:bg-gray-50/50 focus:bg-white"
                            placeholder="••••••••"
                        />
                    </div>
                    
                    {error && (
                        <div className="rounded-xl bg-red-50 p-4 border border-red-100 animate-pulse">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800">Đăng nhập thất bại</h3>
                                    <div className="mt-1 text-sm text-red-600">
                                        <p>{error}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-red-500/20 text-sm font-bold text-white bg-red-600 hover:bg-red-700 hover:shadow-red-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-300 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200 transform hover:-translate-y-0.5"
                        >
                            {loading ? (
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : null}
                            {loading ? 'Đang xử lý...' : 'Đăng nhập'}
                        </button>
                    </div>
                </form>

                {activeTab === UserRole.Hospital && (
                     <div className="relative mt-8">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="px-3 bg-white text-sm font-medium text-gray-400">Chưa có tài khoản?</span>
                        </div>
                        <div className="mt-5 relative z-20">
                             <button
                                type="button"
                                onClick={() => setIsRegisterModalOpen(true)}
                                className="w-full flex justify-center py-3.5 px-4 border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-gray-600 bg-white hover:bg-gray-50 hover:text-red-600 hover:border-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 relative z-20"
                             >
                                Đăng ký Bệnh viện mới
                             </button>
                        </div>
                    </div>
                )}
            </div>
         </div>
      </div>

      <Modal isOpen={isRegisterModalOpen} onClose={() => setIsRegisterModalOpen(false)} title="Đăng ký Bệnh viện">
        <form onSubmit={handleRegisterHospital} className="space-y-5">
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-blue-700">Vui lòng cung cấp thông tin chính xác. Hồ sơ sẽ được Quản trị viên xét duyệt trong vòng 24h.</p>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                 <div className="md:col-span-2">
                    <label htmlFor="reg-name" className="block text-sm font-semibold text-gray-700 mb-1">Tên Bệnh viện <span className="text-red-500">*</span></label>
                    <input type="text" id="reg-name" value={newHospital.name} onChange={e => setNewHospital({...newHospital, name: e.target.value})} className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 sm:text-sm" required placeholder="VD: Bệnh viện Chợ Rẫy" />
                </div>

                 {/* Leaflet Map Section */}
                 <div className="md:col-span-2">
                     <label className="block text-sm font-semibold text-gray-700 mb-2">Vị trí (Kéo bản đồ để ghim chính xác)</label>
                     <div className="relative h-64 w-full rounded-xl overflow-hidden border border-gray-300 shadow-sm group bg-gray-100 z-0">
                         <MapContainer
                            center={[newHospital.lat, newHospital.lng]}
                            zoom={15}
                            style={{ height: '100%', width: '100%' }}
                            scrollWheelZoom={true}
                         >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <MapController onCenterChange={onMapCenterChange} />
                         </MapContainer>
                         
                         {/* Center Marker Overlay */}
                         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-full pointer-events-none text-red-600 filter drop-shadow-md z-[1000]">
                             <MapPinIcon className="w-10 h-10" />
                         </div>
                     </div>
                     <p className="text-xs text-gray-500 mt-1.5 flex items-center bg-gray-100 py-1 px-2 rounded w-fit"><MapPinIcon className="w-3 h-3 mr-1"/>Tọa độ: {newHospital.lat.toFixed(6)}, {newHospital.lng.toFixed(6)}</p>
                </div>

                <div className="md:col-span-2">
                    <label htmlFor="reg-address" className="block text-sm font-semibold text-gray-700 mb-1">Địa chỉ chi tiết <span className="text-red-500">*</span></label>
                    <input type="text" id="reg-address" value={newHospital.address} onChange={e => setNewHospital({...newHospital, address: e.target.value})} className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 sm:text-sm" required placeholder="Số nhà, Tên đường, Phường/Xã..." />
                </div>

                <div>
                    <label htmlFor="reg-email" className="block text-sm font-semibold text-gray-700 mb-1">Email đăng nhập <span className="text-red-500">*</span></label>
                    <input type="email" id="reg-email" value={newHospital.email} onChange={e => setNewHospital({...newHospital, email: e.target.value})} className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 sm:text-sm" required />
                </div>

                <div>
                    <label htmlFor="reg-password" className="block text-sm font-semibold text-gray-700 mb-1">Mật khẩu <span className="text-red-500">*</span></label>
                    <input type="password" id="reg-password" value={newHospital.password} onChange={e => setNewHospital({...newHospital, password: e.target.value})} className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 sm:text-sm" required placeholder="Tối thiểu 6 ký tự" />
                </div>

                <div className="md:col-span-2">
                    <label htmlFor="reg-license" className="block text-sm font-semibold text-gray-700 mb-1">Link Giấy phép (Google Drive) <span className="text-red-500">*</span></label>
                    <input type="url" id="reg-license" value={newHospital.licenseUrl} onChange={e => setNewHospital({...newHospital, licenseUrl: e.target.value})} className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 sm:text-sm" required placeholder="https://drive.google.com/..." />
                    <p className="text-xs text-gray-500 mt-1">Lưu ý: Vui lòng mở quyền truy cập (Public/Anyone with link) cho liên kết này.</p>
                </div>
            </div>

            {registerError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200 font-medium">{registerError}</p>}

            <div className="pt-6 flex justify-end space-x-3 border-t border-gray-100 mt-4 sticky bottom-0 bg-white pb-2 z-10">
                <button type="button" onClick={() => setIsRegisterModalOpen(false)} className="px-5 py-2.5 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:text-red-600 hover:border-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors">
                    Hủy
                </button>
                <button type="submit" disabled={registerLoading} className="inline-flex justify-center px-6 py-2.5 border border-transparent shadow-sm text-sm font-bold rounded-lg text-white bg-red-600 hover:bg-red-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-300 disabled:shadow-none disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5">
                    {registerLoading ? 'Đang xử lý...' : 'Gửi hồ sơ'}
                </button>
            </div>
        </form>
      </Modal>
    </div>
  );
};

export default LoginPage;