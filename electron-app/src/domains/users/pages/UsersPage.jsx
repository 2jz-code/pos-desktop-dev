import { useEffect, useState } from "react";
import {
	getUsers,
	deleteUser,
	createUser,
	updateUser,
	setPin,
} from "@/domains/users/services/userService";
import { Button } from "@/shared/components/ui/button";
import { TableCell } from "@/shared/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { useToast } from "@/shared/components/ui/use-toast";
import { useConfirmation } from "@/shared/components/ui/confirmation-dialog";
import { MoreHorizontal, UserPlus, KeyRound, Trash2, Edit, Users, AlertTriangle } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { DomainPageLayout, StandardTable } from "@/shared/components/layout";
import { useAuth } from "@/context/AuthContext";

const ROLES = {
	OWNER: "Owner",
	ADMIN: "Admin",
	MANAGER: "Manager",
	CASHIER: "Cashier",
	CUSTOMER: "Customer",
};

const ROLE_LEVELS = {
	CASHIER: 1,
	MANAGER: 2,
	OWNER: 3,
};

// Roles that can be assigned/edited in the POS UI
const EDITABLE_ROLES = {
	OWNER: "Owner",
	MANAGER: "Manager",
	CASHIER: "Cashier",
};

export function UsersPage() {
	const { user, isOwner, isManager, isCashier } = useAuth();

	// Note: Backend now filters users to only return POS staff (is_pos_staff=True)
	// This prevents customer accounts from cluttering the POS interface
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [filteredUsers, setFilteredUsers] = useState([]);
	const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
	const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
	const [editingUser, setEditingUser] = useState(null);
	const [selectedUserForPin, setSelectedUserForPin] = useState(null);
	const [filters, setFilters] = useState({
		search: "",
	});
	const [formData, setFormData] = useState({
		username: "",
		email: "",
		role: "CASHIER",
		password: "",
		first_name: "",
		last_name: "",
	});
	const [pinData, setPinData] = useState({ pin: "" });
	const { toast } = useToast();
	const confirmation = useConfirmation();

	const canCreateUsers = isOwner || isManager;

	const canEditUser = (targetUser) => {
		if (!user) return false;
		if (user.id === targetUser.id) return true;
		if (isCashier) return false;
		if (isManager) return targetUser.role === "CASHIER";
		if (isOwner) return true;
		return false;
	};

	const canDeleteUser = (targetUser) => {
		if (!user || user.id === targetUser.id) return false;
		if (isCashier) return false;
		if (isManager) return targetUser.role === "CASHIER";
		if (isOwner) return true;
		return false;
	};

	const canSetPin = (targetUser) => {
		if (!user) return false;
		if (user.id === targetUser.id) return true;
		return canEditUser(targetUser) && user.id !== targetUser.id;
	};

	const getAvailableRolesForCreation = () => {
		if (isManager) return ["CASHIER"];
		if (isOwner) return ["CASHIER", "MANAGER", "OWNER"];
		return [];
	};

	useEffect(() => {
		fetchUsers();
	}, []);

	useEffect(() => {
		applyFilters();
	}, [users, filters.search]);

	const applyFilters = () => {
		// Ensure users is an array before spreading
		const usersArray = Array.isArray(users) ? users : [];
		let filtered = [...usersArray];

		if (filters.search) {
			const searchLower = filters.search.toLowerCase();
			filtered = filtered.filter((u) => {
				const username = u.username?.toLowerCase() || "";
				const email = u.email?.toLowerCase() || "";
				const fullName = `${u.first_name || ""} ${u.last_name || ""}`
					.trim()
					.toLowerCase();
				const roleName = ROLES[u.role]?.toLowerCase() || "";
				return (
					username.includes(searchLower) ||
					email.includes(searchLower) ||
					fullName.includes(searchLower) ||
					roleName.includes(searchLower)
				);
			});
		}

		setFilteredUsers(filtered);
	};

	const fetchUsers = async () => {
		try {
			setLoading(true);
			const response = await getUsers();
			// Handle paginated response - users are in results field
			setUsers(response.data?.results || response.data || []);
			setError(null);
		} catch (err) {
			console.error("Failed to fetch users:", err);
			setError("Failed to fetch users.");
			toast({
				title: "Error",
				description: "Failed to fetch users.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleDelete = async (userToDelete) => {
		confirmation.show({
			title: "Delete User",
			description: `Are you sure you want to delete "${userToDelete.first_name} ${userToDelete.last_name}"? This action cannot be undone.`,
			confirmText: "Delete",
			cancelText: "Cancel",
			variant: "destructive",
			icon: AlertTriangle,
			onConfirm: async () => {
				try {
					await deleteUser(userToDelete.id);
					fetchUsers();
					toast({
						title: "Success",
						description: "User deleted successfully.",
					});
				} catch (error) {
					console.error("Failed to delete user:", error);
					toast({
						title: "Error",
						description: "Failed to delete user.",
						variant: "destructive",
					});
				}
			},
		});
	};

	const handleSearchChange = (e) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	};

	const handleFormChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handlePinChange = (e) => {
		const { name, value } = e.target;
		setPinData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSelectChange = (value) => {
		setFormData((prev) => ({ ...prev, role: value }));
	};

	const handleUserFormSubmit = async (e) => {
		e.preventDefault();
		try {
			if (editingUser) {
				const updateData = {
					username: formData.username,
					email: formData.email,
					first_name: formData.first_name,
					last_name: formData.last_name,
				};

				if (isOwner || (isManager && editingUser.role === "CASHIER")) {
					updateData.role = formData.role;
				}

				await updateUser(editingUser.id, updateData);
				toast({
					title: "Success",
					description: "User updated successfully.",
				});
			} else {
				await createUser(formData);
				toast({
					title: "Success",
					description: "User created successfully.",
				});
			}
			closeUserDialog();
			fetchUsers();
		} catch (error) {
			console.error("Failed to save user:", error);
			toast({
				title: "Error",
				description: "Failed to save user.",
				variant: "destructive",
			});
		}
	};

	const handlePinFormSubmit = async (e) => {
		e.preventDefault();
		try {
			await setPin(selectedUserForPin.id, pinData.pin);
			toast({
				title: "Success",
				description: "PIN set successfully.",
			});
			closePinDialog();
		} catch (error) {
			console.error("Failed to set PIN:", error);
			toast({
				title: "Error",
				description: "Failed to set PIN.",
				variant: "destructive",
			});
		}
	};

	const openCreateDialog = () => {
		setEditingUser(null);
		setFormData({
			username: "",
			email: "",
			role: "CASHIER",
			password: "",
			first_name: "",
			last_name: "",
		});
		setIsUserDialogOpen(true);
	};

	const openEditDialog = (targetUser) => {
		setEditingUser(targetUser);
		setFormData({
			username: targetUser.username,
			email: targetUser.email,
			role: targetUser.role,
			password: "",
			first_name: targetUser.first_name || "",
			last_name: targetUser.last_name || "",
		});
		setIsUserDialogOpen(true);
	};

	const openPinDialog = (targetUser) => {
		setSelectedUserForPin(targetUser);
		setPinData({ pin: "" });
		setIsPinDialogOpen(true);
	};

	const closeUserDialog = () => {
		setIsUserDialogOpen(false);
		setEditingUser(null);
	};

	const closePinDialog = () => {
		setIsPinDialogOpen(false);
		setSelectedUserForPin(null);
	};

	const isSelfEditingCashier = isCashier;

	const headers = [
		{ label: "Name" },
		{ label: "Username" },
		{ label: "Email" },
		{ label: "Role" },
		{ label: "Actions", className: "text-right" },
	];

	const renderUserRow = (targetUser) => (
		<>
			<TableCell className="font-medium">
				{`${targetUser.first_name || ""} ${
					targetUser.last_name || ""
				}`.trim() || "N/A"}
			</TableCell>
			<TableCell>{targetUser.username}</TableCell>
			<TableCell>{targetUser.email}</TableCell>
			<TableCell>
				<Badge variant="outline">{ROLES[targetUser.role]}</Badge>
			</TableCell>
			<TableCell
				onClick={(e) => e.stopPropagation()}
				className="text-right"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
						>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						{canEditUser(targetUser) && (
							<DropdownMenuItem onClick={() => openEditDialog(targetUser)}>
								<Edit className="mr-2 h-4 w-4" />
								Edit
							</DropdownMenuItem>
						)}
						{canSetPin(targetUser) && (
							<DropdownMenuItem onClick={() => openPinDialog(targetUser)}>
								<KeyRound className="mr-2 h-4 w-4" />
								Set PIN
							</DropdownMenuItem>
						)}
						{canDeleteUser(targetUser) && (
							<DropdownMenuItem
								onClick={() => handleDelete(targetUser)}
								className="text-destructive"
							>
								<Trash2 className="mr-2 h-4 w-4" />
								Delete
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</>
	);

	const headerActions = canCreateUsers ? (
		<Button onClick={openCreateDialog}>
			<UserPlus className="mr-2 h-4 w-4" />
			Create User
		</Button>
	) : null;

	return (
		<>
			<DomainPageLayout
				pageTitle={isSelfEditingCashier ? "My Profile" : "User Management"}
				pageDescription={
					isSelfEditingCashier
						? "Manage your personal information and settings."
						: "Manage users in your system."
				}
				pageIcon={Users}
				pageActions={headerActions}
				title="Filters & Search"
				searchPlaceholder="Search by name, username, email, or role..."
				searchValue={filters.search}
				onSearchChange={handleSearchChange}
				error={error}
			>
				<StandardTable
					headers={headers}
					data={filteredUsers}
					loading={loading}
					emptyMessage="No users found for the selected filters."
					renderRow={renderUserRow}
				/>
			</DomainPageLayout>

			{/* User Create/Edit Dialog */}
			<Dialog
				open={isUserDialogOpen}
				onOpenChange={setIsUserDialogOpen}
			>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>
							{editingUser ? "Edit User" : "Create User"}
						</DialogTitle>
						<DialogDescription>
							{editingUser
								? "Update the user's information."
								: "Create a new user for your system."}
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleUserFormSubmit}>
						<div className="grid gap-4 py-4">
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="email"
									className="text-right"
								>
									Email
								</Label>
								<Input
									id="email"
									name="email"
									type="email"
									value={formData.email}
									onChange={handleFormChange}
									className="col-span-3"
									required
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="username"
									className="text-right"
								>
									Username
								</Label>
								<Input
									id="username"
									name="username"
									value={formData.username}
									onChange={handleFormChange}
									className="col-span-3"
									required
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="first_name"
									className="text-right"
								>
									First Name
								</Label>
								<Input
									id="first_name"
									name="first_name"
									value={formData.first_name}
									onChange={handleFormChange}
									className="col-span-3"
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="last_name"
									className="text-right"
								>
									Last Name
								</Label>
								<Input
									id="last_name"
									name="last_name"
									value={formData.last_name}
									onChange={handleFormChange}
									className="col-span-3"
								/>
							</div>
							{((!editingUser && canCreateUsers) ||
								(editingUser &&
									(isOwner ||
										(isManager && editingUser.role === "CASHIER")))) && (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label
										htmlFor="role"
										className="text-right"
									>
										Role
									</Label>
									<Select
										onValueChange={handleSelectChange}
										defaultValue={formData.role}
										value={formData.role}
									>
										<SelectTrigger className="col-span-3">
											<SelectValue placeholder="Select a role" />
										</SelectTrigger>
										<SelectContent>
											{(editingUser
												? Object.keys(EDITABLE_ROLES)
												: getAvailableRolesForCreation()
											).map((roleKey) => (
												<SelectItem
													key={roleKey}
													value={roleKey}
												>
													{ROLES[roleKey]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
							{!editingUser && (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label
										htmlFor="password"
										className="text-right"
									>
										Password
									</Label>
									<Input
										id="password"
										name="password"
										type="password"
										value={formData.password}
										onChange={handleFormChange}
										className="col-span-3"
										required
									/>
								</div>
							)}
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={closeUserDialog}
							>
								Cancel
							</Button>
							<Button type="submit">Save</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* PIN Setting Dialog */}
			<Dialog
				open={isPinDialogOpen}
				onOpenChange={setIsPinDialogOpen}
			>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>
							Set PIN for {selectedUserForPin?.username}
						</DialogTitle>
						<DialogDescription>
							Set a 4-6 digit PIN for POS system access.
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={handlePinFormSubmit}>
						<div className="grid gap-4 py-4">
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="pin"
									className="text-right"
								>
									PIN
								</Label>
								<Input
									id="pin"
									name="pin"
									type="password"
									value={pinData.pin}
									onChange={handlePinChange}
									className="col-span-3"
									maxLength={6}
									pattern="[0-9]{4,6}"
									placeholder="Enter 4-6 digit PIN"
									required
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={closePinDialog}
							>
								Cancel
							</Button>
							<Button type="submit">Set PIN</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Confirmation Dialog */}
			{confirmation.dialog}
		</>
	);
}
