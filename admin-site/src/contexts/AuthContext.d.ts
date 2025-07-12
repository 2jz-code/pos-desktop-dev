interface User {
	id: string;
	username?: string;
	email?: string;
	role?: string;
}

interface AuthContextType {
	user: User | null;
	loading: boolean;
	login: (email: string, password: string) => Promise<User>;
	logout: () => Promise<void>;
	isAuthenticated: boolean;
	isOwner: boolean;
	isManager: boolean;
	isCashier: boolean;
}

declare const AuthProvider: React.FC<{ children: React.ReactNode }>;
declare const useAuth: () => AuthContextType;

export { AuthProvider, useAuth };
export type { User, AuthContextType };
