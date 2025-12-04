import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import AppointmentManagement from './pages/AppointmentManagement';
import EmergencyRequest from './pages/EmergencyRequest';
import AIChatbot from './pages/AIChatbot';
import AdminDashboard from './pages/AdminDashboard';
import HospitalManagement from './pages/HospitalManagement';
import UserManagement from './pages/UserManagement';
import AdminEmergencyRequestManagement from './pages/AdminEmergencyRequestManagement';
import AdminMap from './pages/AdminMap';
import LoginPage from './pages/LoginPage';
import { Page, UserRole, UserStatus } from './types';
import { auth, db } from './firebase';
import { onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { HeartIcon } from '@heroicons/react/24/solid';
import HospitalManageEmergency from './pages/HospitalManageEmergency';

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<Page>(Page.Dashboard);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
            // Fetch user role and name from Firestore
            const roleDocRef = doc(db, 'user_roles', currentUser.uid);
            const userDocRef = doc(db, 'users', currentUser.uid);

            const [roleDocSnap, userDocSnap] = await Promise.all([
            getDoc(roleDocRef),
            getDoc(userDocRef)
            ]);

            // 1. KIỂM TRA TÀI KHOẢN CÒN TẠI KHÔNG (Đã bị xóa chưa)
            if (!roleDocSnap.exists()) {
                await signOut(auth);
                setUser(null);
                setUserRole(null);
                setLoading(false);
                return;
            }

            // 2. KIỂM TRA TRẠNG THÁI KHÓA (UserStatus.Locked)
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                if (userData.status === UserStatus.Locked) {
                    await signOut(auth);
                    setUser(null);
                    setUserRole(null);
                    setLoading(false);
                    return;
                }
                setUserName(userData.fullName || 'Không rõ');
            } else {
                setUserName('Không rõ');
            }

            // Nếu vượt qua các bài kiểm tra trên, thiết lập state đăng nhập thành công
            const role = roleDocSnap.data().role as UserRole;
            setUser(currentUser);
            setUserRole(role);
            setActivePage(role === UserRole.Admin ? Page.AdminDashboard : Page.Dashboard);

        } catch (error) {
            console.error("Error fetching user data:", error);
            // Fallback an toàn nếu lỗi mạng hoặc lỗi khác
            setUser(null);
            setUserRole(null);
        }
      } else {
        setUser(null);
        setUserRole(null);
        setUserName('');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
        <div className="flex flex-col justify-center items-center h-screen bg-gray-100">
            <HeartIcon className="w-16 h-16 text-red-500 animate-pulse" />
            <p className="text-gray-600 mt-4">Đang tải ứng dụng...</p>
        </div>
    );
  }

  if (!user || !userRole) {
    return <LoginPage />;
  }

  const renderPage = () => {
    if (userRole === UserRole.Hospital) {
        switch (activePage) {
            case Page.Dashboard: return <Dashboard setActivePage={setActivePage} />;
            case Page.Appointments: return <AppointmentManagement />;
            case Page.EmergencyRequests: return <EmergencyRequest />;
            case Page.AIChatbot: return <AIChatbot />;
            case Page.HospitalManageEmergencyRequests: return <HospitalManageEmergency />;
            default: return <Dashboard setActivePage={setActivePage} />;
        }
    } else { // Admin Role
        switch (activePage) {
            case Page.AdminDashboard: return <AdminDashboard />;
            case Page.ManageHospitals: return <HospitalManagement />;
            case Page.ManageUsers: return <UserManagement />;
            case Page.ManageEmergencyRequests: return <AdminEmergencyRequestManagement />;
            case Page.AdminMap: return <AdminMap />;
            default: return <AdminDashboard />;
        }
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar 
        activePage={activePage} 
        setActivePage={setActivePage} 
        userRole={userRole}
        userName={userName}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
      <main className="flex-1 ml-0 md:ml-64 flex flex-col">
          <Header 
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            activePage={activePage}
          />
          <div className="overflow-y-auto flex-1">
            {renderPage()}
          </div>
      </main>
    </div>
  );
};

export default App;