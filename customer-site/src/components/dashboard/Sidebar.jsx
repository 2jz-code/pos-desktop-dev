import React from "react";
import { User, ShoppingBag, LogOut } from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const Sidebar = () => {
	const { activeTab, setActiveTab, profile } = useDashboard();
	const { logout } = useAuth();

	const handleLogout = () => {
		logout();
		// The logout function should handle redirecting the user
	};

	const navItems = [
		{ id: "profile", label: "Profile", icon: User },
		{ id: "orders", label: "Order History", icon: ShoppingBag },
	];

	return (
		<aside className="md:w-64 flex-shrink-0">
			<Card className="sticky top-24 overflow-hidden">
				<div className="p-4 border-b flex items-center gap-4">
					<Avatar>
						<AvatarImage
							src={profile?.profile_image}
							alt={profile?.first_name}
						/>
						<AvatarFallback>
							{profile?.first_name?.[0]}
							{profile?.last_name?.[0]}
						</AvatarFallback>
					</Avatar>
					<div className="truncate">
						<p className="font-semibold truncate">
							{profile?.first_name} {profile?.last_name}
						</p>
						<p className="text-sm text-muted-foreground truncate">
							{profile?.email}
						</p>
					</div>
				</div>

				<nav className="p-2">
					{navItems.map((item) => (
						<Button
							key={item.id}
							variant={activeTab === item.id ? "secondary" : "ghost"}
							className="w-full justify-start mb-1"
							onClick={() => setActiveTab(item.id)}
						>
							<item.icon className="mr-3 h-4 w-4" />
							{item.label}
						</Button>
					))}
					<Button
						variant="ghost"
						className="w-full justify-start mt-4 text-destructive hover:text-destructive hover:bg-destructive/10"
						onClick={handleLogout}
					>
						<LogOut className="mr-3 h-4 w-4" />
						Logout
					</Button>
				</nav>
			</Card>
		</aside>
	);
};

export default Sidebar;
