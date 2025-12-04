
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
    <div className="flex flex-col h-full bg-white text-gray-700">
        <div className="flex items-center justify-center p-6 border-b border-gray-100 bg-gradient-to-r from-red-50 to-white">
            <div className="bg-red-500 p-1.5 rounded-lg shadow-sm">
                <HeartIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-lg font-bold text-gray-800 ml-3 tracking-wide uppercase text-sm">{title}</h1>
        </div>
        
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
            <ul>
            {links.map(({ name, icon: Icon }) => {
                const isActive = activePage === name;
                return (
                    <li key={name} className="mb-1">
                        <button
                            onClick={() => handleLinkClick(name)}
                            className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 group relative
                            ${isActive 
                                ? 'bg-red-50 text-red-700' 
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                        >
                            {isActive && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-red-600 rounded-r-md"></span>
                            )}
                            <Icon className={`w-5 h-5 mr-3 transition-colors ${isActive ? 'text-red-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                            <span className="truncate">{name}</span>
                        </button>
                    </li>
                );
            })}
            </ul>
        </nav>
        
        <div className="p-4 border-t border-gray-100 bg-gray-50">
            {isHospital && (
              <div className="mb-4 flex items-center p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-xs mr-3">
                    {userName.charAt(0).toUpperCase()}
                </div>
                <div className="overflow-hidden">
                    <p className="text-xs text-gray-500">Xin chào,</p>
                    <p className="font-semibold text-sm text-gray-800 truncate" title={userName}>{userName}</p>
                </div>
              </div>
            )}
            <button
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-2.5 text-left text-sm font-medium text-gray-500 rounded-lg transition-colors duration-200 hover:bg-red-50 hover:text-red-700 group"
            >
                <ArrowLeftOnRectangleIcon className="w-5 h-5 mr-3 group-hover:text-red-600" />
                <span>Đăng xuất</span>
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-4">Version 1.0.2 © 2025 SBD</p>
        </div>
    </div>
  );

  return (
    <>
        {/* Mobile Sidebar Overlay with Backdrop Blur */}
        <div 
            className={`fixed inset-0 z-30 transition-all duration-300 md:hidden 
            ${isOpen ? 'bg-black/30 backdrop-blur-sm' : 'pointer-events-none opacity-0'}`} 
            onClick={() => setIsOpen(false)}
        ></div>
        
        {/* Mobile Sidebar */}
        <div className={`fixed top-0 left-0 h-full w-72 bg-white shadow-2xl z-40 transform transition-transform duration-300 ease-in-out md:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            {sidebarContent}
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden md:block w-64 bg-white shadow-xl border-r border-gray-100 fixed h-screen z-10">
            {sidebarContent}
        </div>
    </>
  );
};

export default Sidebar;
