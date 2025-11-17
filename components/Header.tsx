
import React from 'react';
import { Bars3Icon } from './icons/Icons';
import { Page } from '../types';

interface HeaderProps {
    toggleSidebar: () => void;
    activePage: Page;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar, activePage }) => {
    return (
        <header className="md:hidden bg-white shadow-sm flex items-center justify-between p-4 sticky top-0 z-20">
            <button onClick={toggleSidebar} className="text-gray-600 hover:text-gray-800">
                <Bars3Icon className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold text-gray-800">{activePage}</h1>
            <div className="w-6"></div> {/* Spacer to balance the title */}
        </header>
    );
};

export default Header;
