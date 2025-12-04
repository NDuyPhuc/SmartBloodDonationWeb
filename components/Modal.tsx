import React from 'react';
import { CloseIcon } from './icons/Icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center p-4">
      {/* Backdrop with blur and fade animation */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fade-in" 
        onClick={onClose}
      ></div>

      {/* Modal Content with scale animation */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto z-50 flex flex-col max-h-[90vh] animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-white z-10">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">{title}</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-full transition-all duration-200"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/30">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;