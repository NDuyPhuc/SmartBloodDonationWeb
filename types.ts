
export enum UserRole {
  Admin = 'Quản trị viên',
  Hospital = 'Bệnh viện',
}

export enum Page {
  // Hospital Pages
  Dashboard = 'Bảng điều khiển',
  Appointments = 'Quản lý Lịch hẹn',
  EmergencyRequests = 'Yêu cầu Khẩn cấp',
  AIChatbot = 'Trợ lý AI',
  HospitalManageEmergencyRequests = 'Quản lý Yêu cầu khẩn cấp',
  // Admin Pages
  AdminDashboard = 'BĐK Quản trị',
  ManageHospitals = 'Quản lý Bệnh viện',
  ManageUsers = 'Quản lý Người dùng',
  ManageEmergencyRequests = 'Quản lý Yêu cầu khẩn cấp',
  AdminMap = 'Bản đồ Bệnh viện',
}

export enum AppointmentStatus {
  Pending = 'Đang chờ',
  Confirmed = 'ĐÃ XÁC NHẬN',
  Cancelled = 'ĐÃ HỦY',
  Completed = 'Đã hoàn thành',
}

export enum BloodType {
  APositive = 'A+',
  ANegative = 'A-',
  BPositive = 'B+',
  BNegative = 'B-',
  ABPositive = 'AB+',
  ABNegative = 'AB-',
  OPositive = 'O+',
  ONegative = 'O-',
}

export enum RequestStatus {
  Pending = 'ĐANG CHỜ',
  Active = 'ĐANG HOẠT ĐỘNG',
  InProgress = 'Đang tiến hành',
  Completed = 'ĐÃ HOÀN THÀNH',
}

export enum PriorityLevel {
    High = 'Cao',
    Medium = 'Trung bình',
    Low = 'Thấp',
}

export enum HospitalStatus {
    Pending = 'Chờ duyệt',
    Approved = 'Đã duyệt',
    Rejected = 'Đã từ chối',
}

export enum UserStatus {
    Active = 'Hoạt động',
    Locked = 'Đã khóa',
}


export interface Appointment {
  id: string;
  userId: string;
  hospitalId: string;
  donorName?: string; // Will be populated after fetching user data
  bloodType?: BloodType; // Will be populated after fetching user data
  dateTime: {
    seconds: number;
    nanoseconds: number;
  };
  hospitalName: string;
  status: AppointmentStatus;
}

export interface PledgedDonor {
  userId: string;
  userName: string;
  userAge?: number;
  userGender?: 'Nam' | 'Nữ' | 'Khác';
  userPhone?: string;
  userBloodType: BloodType;
  requestedBloodType?: BloodType;
  status?: string;
  pledgedAt: {
    seconds: number;
    nanoseconds: number;
  };
}


export interface BloodRequest {
  id: string;
  bloodType: BloodType;
  quantity: number; // in units
  priority: PriorityLevel;
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
  status: RequestStatus;
  hospitalId?: string;
  hospitalName?: string;
  donorsCount?: number;
}

export interface ChatMessage {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  isLoading?: boolean;
}

export interface Hospital {
    id: string;
    name: string;
    address: string;
    licenseUrl: string;
    status: HospitalStatus;
    loginStatus?: UserStatus;
    location?: {
        lat: number;
        lng: number;
    };
    inventory?: Record<string, number>; // Stores blood type counts: { "A+": 10, "B-": 5 }
}

export interface User {
    uid: string;
    fullName: string;
    bloodType?: BloodType;
    age?: number;
    gender?: 'Nam' | 'Nữ' | 'Khác';
    lastDonationDate: string | null;
    email: string;
    phoneNumber?: string;
    status: UserStatus;
}