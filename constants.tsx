import { Page } from './types';
import { DashboardIcon, CalendarIcon, MegaphoneIcon, ChatBubbleIcon, UsersIcon, BuildingOfficeIcon } from './components/icons/Icons';

export const HOSPITAL_SIDEBAR_LINKS = [
  { name: Page.Dashboard, icon: DashboardIcon },
  { name: Page.Appointments, icon: CalendarIcon },
  { name: Page.EmergencyRequests, icon: MegaphoneIcon },
  { name: Page.AIChatbot, icon: ChatBubbleIcon },
  { name: Page.HospitalManageEmergencyRequests, icon: UsersIcon },
];

export const ADMIN_SIDEBAR_LINKS = [
    { name: Page.AdminDashboard, icon: DashboardIcon },
    { name: Page.ManageHospitals, icon: BuildingOfficeIcon },
    { name: Page.ManageUsers, icon: UsersIcon },
    { name: Page.ManageEmergencyRequests, icon: MegaphoneIcon },
];

// Mock data has been removed and the app now connects to Firebase.