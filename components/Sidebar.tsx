
import React from 'react';
import { Page, UserRole } from '../types';
import { HOSPITAL_SIDEBAR_LINKS, ADMIN_SIDEBAR_LINKS } from '../constants';
import { HeartIcon } from '@heroicons/react/24/solid';
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

interface SidebarProps {
  activePage: Page;
  setActivePage: (page: Page) => void;
  userRole: UserRole;
  userName: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activePage, setActivePage, userRole, userName, isOpen, setIsOpen }) => {
  const isHospital = userRole === UserRole.Hospital;
  const links = isHospital ? HOSPITAL_SIDEBAR_LINKS : ADMIN_SIDEBAR_LINKS;
  const title = isHospital ? 'Cổng Bệnh viện' : 'Cổng Quản trị';

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };
  
  const handleLinkClick = (page: Page) => {
    setActivePage(page);
    setIsOpen(false); // Close sidebar on mobile after navigation
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
        <div className="flex items-center justify-center p-6 border-b">
            <HeartIcon className="w-8 h-8 text-red-500" />
            <h1 className="text-xl font-bold text-gray-800 ml-2">{title}</h1>
        </div>
        <nav className="flex-1 px-4 py-6">
            <ul>
            {links.map(({ name, icon: Icon }) => (
                <li key={name}>
                <button
                    onClick={() => handleLinkClick(name)}
                    className={`flex items-center w-full px-4 py-3 text-left text-gray-600 rounded-lg transition-colors duration-200 ${
                    activePage === name
                        ? 'bg-red-500 text-white shadow-lg'
                        : 'hover:bg-gray-100 hover:text-gray-800'
                    }`}
                >
                    <Icon className="w-6 h-6 mr-3" />
                    <span className="font-medium">{name}</span>
                </button>
                </li>
            ))}
            </ul>
        </nav>
        <div className="p-4 border-t">
            {isHospital && (
              <div className="mb-4 text-center">
                <p className="font-semibold text-gray-800 truncate" title={userName}>{userName}</p>
              </div>
            )}
            <button
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-3 text-left text-gray-600 rounded-lg transition-colors duration-200 hover:bg-gray-100 hover:text-gray-800"
            >
                <ArrowLeftOnRectangleIcon className="w-6 h-6 mr-3" />
                <span className="font-medium">Đăng xuất</span>
            </button>
            <p className="text-sm text-gray-500 text-center mt-4">© 2025 Smart Blood Donation</p>
        </div>
    </div>
  );

  return (
    <>
        {/* Mobile Sidebar */}
        <div className={`fixed inset-0 z-30 transition-opacity duration-300 md:hidden ${isOpen ? 'bg-black bg-opacity-50' : 'pointer-events-none opacity-0'}`} onClick={() => setIsOpen(false)}></div>
        <div className={`fixed top-0 left-0 h-full w-64 bg-white shadow-md z-40 transform transition-transform duration-300 md:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            {sidebarContent}
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden md:block w-64 bg-white shadow-md fixed h-screen">
            {sidebarContent}
        </div>
    </>
  );
};

export default Sidebar;