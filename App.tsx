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
import LoginPage from './pages/LoginPage';
import { Page, UserRole } from './types';
import { auth, db } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        
        // Fetch user role and name from Firestore
        const roleDocRef = doc(db, 'user_roles', user.uid);
        const userDocRef = doc(db, 'users', user.uid);

        const [roleDocSnap, userDocSnap] = await Promise.all([
          getDoc(roleDocRef),
          getDoc(userDocRef)
        ]);

        if (roleDocSnap.exists()) {
          const role = roleDocSnap.data().role as UserRole;
          setUserRole(role);
          setActivePage(role === UserRole.Admin ? Page.AdminDashboard : Page.Dashboard);
        } else {
          console.error("No role document found for user!");
          setUserRole(null); // No role, treat as unauthenticated
        }

        if (userDocSnap.exists()) {
          setUserName(userDocSnap.data().fullName || 'Không rõ');
        } else {
          console.log("No user document found, this might be okay for some user types.");
          setUserName('Không rõ');
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