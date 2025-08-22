// import { useState } from "react";
// import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import {
// 	getUsers,
// 	deleteUser,
// 	createUser,
// 	updateUser,
// 	setPin,
// } from "@/services/api/userService";
// import { Button } from "@/components/ui/button";
// import { TableCell } from "@/components/ui/table";
// import {
// 	Dialog,
// 	DialogContent,
// 	DialogDescription,
// 	DialogFooter,
// 	DialogHeader,
// 	DialogTitle,
// } from "@/components/ui/dialog";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import {
// 	Select,
// 	SelectContent,
// 	SelectItem,
// 	SelectTrigger,
// 	SelectValue,
// } from "@/components/ui/select";
// import { Badge } from "@/components/ui/badge";
// import { useToast } from "@/components/ui/use-toast";
// import { useConfirmation } from "@/components/ui/confirmation-dialog";
// import {
// 	MoreHorizontal,
// 	UserPlus,
// 	KeyRound,
// 	Trash2,
// 	Edit,
// 	Users,
// } from "lucide-react";
// import {
// 	DropdownMenu,
// 	DropdownMenuContent,
// 	DropdownMenuItem,
// 	DropdownMenuLabel,
// 	DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu";
// import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
// import { StandardTable } from "@/components/shared/StandardTable";
// import { useAuth } from "@/contexts/AuthContext";
// import { useMemo } from "react";

// const ROLES = {
// 	OWNER: "Owner",
// 	ADMIN: "Admin",
// 	MANAGER: "Manager",
// 	CASHIER: "Cashier",
// 	CUSTOMER: "Customer",
// };

// const ROLE_LEVELS = {
// 	CASHIER: 1,
// 	MANAGER: 2,
// 	OWNER: 3,
// };

// // Roles that can be assigned/edited in the Admin UI
// const EDITABLE_ROLES = {
// 	OWNER: "Owner",
// 	MANAGER: "Manager",
// 	CASHIER: "Cashier",
// };

// export function UsersPage() {
// 	const { user } = useAuth();
// 	const queryClient = useQueryClient();
// 	const { toast } = useToast();
// 	const confirmation = useConfirmation();

// 	// State for dialogs and forms
// 	const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
// 	const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
// 	const [editingUser, setEditingUser] = useState(null);
// 	const [selectedUserForPin, setSelectedUserForPin] = useState(null);
// 	const [filters, setFilters] = useState({
// 		search: "",
// 	});
// 	const [formData, setFormData] = useState({
// 		username: "",
// 		email: "",
// 		role: "CASHIER",
// 		password: "",
// 		first_name: "",
// 		last_name: "",
// 	});
// 	const [pinData, setPinData] = useState({ pin: "" });

// 	// Permission checks - Admin site should be owner-only but keeping logic for future
// 	const isOwner = user?.role === "OWNER";
// 	const isManager = user?.role === "MANAGER";
// 	const isCashier = user?.role === "CASHIER";

// 	const canCreateUsers = isOwner || isManager;

// 	const canEditUser = (targetUser) => {
// 		if (!user) return false;
// 		if (user.id === targetUser.id) return true;
// 		if (isCashier) return false;
// 		if (isManager) return targetUser.role === "CASHIER";
// 		if (isOwner) return true;
// 		return false;
// 	};

// 	const canDeleteUser = (targetUser) => {
// 		if (!user || user.id === targetUser.id) return false;
// 		if (isCashier) return false;
// 		if (isManager) return targetUser.role === "CASHIER";
// 		if (isOwner) return true;
// 		return false;
// 	};

// 	const canSetPin = (targetUser) => {
// 		if (!user) return false;
// 		if (user.id === targetUser.id) return true;
// 		return canEditUser(targetUser) && user.id !== targetUser.id;
// 	};

// 	const getAvailableRolesForCreation = () => {
// 		if (isManager) return ["CASHIER"];
// 		if (isOwner) return ["CASHIER", "MANAGER", "OWNER"];
// 		return [];
// 	};

// 	// Fetch users
// 	const {
// 		data: users = [],
// 		isLoading,
// 		error,
// 	} = useQuery({
// 		queryKey: ["users"],
// 		queryFn: () => getUsers().then((res) => res.data),
// 	});

// 	// Filter users based on search
// 	const filteredUsers = useMemo(() => {
// 		if (!filters.search) return users;

// 		const searchLower = filters.search.toLowerCase();
// 		return users.filter((u) => {
// 			const username = u.username?.toLowerCase() || "";
// 			const email = u.email?.toLowerCase() || "";
// 			const fullName = `${u.first_name || ""} ${u.last_name || ""}`
// 				.trim()
// 				.toLowerCase();
// 			const roleName = ROLES[u.role]?.toLowerCase() || "";
// 			return (
// 				username.includes(searchLower) ||
// 				email.includes(searchLower) ||
// 				fullName.includes(searchLower) ||
// 				roleName.includes(searchLower)
// 			);
// 		});
// 	}, [users, filters.search]);

// 	// Mutations
// 	const createUserMutation = useMutation({
// 		mutationFn: createUser,
// 		onSuccess: () => {
// 			toast({
// 				title: "Success",
// 				description: "User created successfully.",
// 			});
// 			queryClient.invalidateQueries({ queryKey: ["users"] });
// 			closeUserDialog();
// 		},
// 		onError: (error) => {
// 			console.error("Failed to create user:", error);
// 			toast({
// 				title: "Error",
// 				description: "Failed to create user.",
// 				variant: "destructive",
// 			});
// 		},
// 	});

// 	const updateUserMutation = useMutation({
// 		mutationFn: ({ id, userData }) => updateUser(id, userData),
// 		onSuccess: () => {
// 			toast({
// 				title: "Success",
// 				description: "User updated successfully.",
// 			});
// 			queryClient.invalidateQueries({ queryKey: ["users"] });
// 			closeUserDialog();
// 		},
// 		onError: (error) => {
// 			console.error("Failed to update user:", error);
// 			toast({
// 				title: "Error",
// 				description: "Failed to update user.",
// 				variant: "destructive",
// 			});
// 		},
// 	});

// 	const deleteUserMutation = useMutation({
// 		mutationFn: deleteUser,
// 		onSuccess: () => {
// 			toast({
// 				title: "Success",
// 				description: "User deleted successfully.",
// 			});
// 			queryClient.invalidateQueries({ queryKey: ["users"] });
// 		},
// 		onError: (error) => {
// 			console.error("Failed to delete user:", error);
// 			toast({
// 				title: "Error",
// 				description: "Failed to delete user.",
// 				variant: "destructive",
// 			});
// 		},
// 	});

// 	const setPinMutation = useMutation({
// 		mutationFn: ({ userId, pinData }) => setPin(userId, pinData),
// 		onSuccess: () => {
// 			toast({
// 				title: "Success",
// 				description: "PIN set successfully.",
// 			});
// 			closePinDialog();
// 		},
// 		onError: (error) => {
// 			console.error("Failed to set PIN:", error);
// 			toast({
// 				title: "Error",
// 				description: "Failed to set PIN.",
// 				variant: "destructive",
// 			});
// 		},
// 	});

// 	// Event handlers
// 	const handleDelete = async (userId, userToDelete) => {
// 		confirmation.show({
// 			title: "Delete User",
// 			description: `Are you sure you want to delete "${userToDelete.first_name} ${userToDelete.last_name}"? This action cannot be undone.`,
// 			variant: "destructive",
// 			confirmText: "Delete",
// 			onConfirm: () => {
// 				deleteUserMutation.mutate(userId);
// 			}
// 		});
// 	};

// 	const handleSearchChange = (e) => {
// 		const value = e.target.value;
// 		setFilters((prev) => ({ ...prev, search: value }));
// 	};

// 	const handleFormChange = (e) => {
// 		const { name, value } = e.target;
// 		setFormData((prev) => ({ ...prev, [name]: value }));
// 	};

// 	const handlePinChange = (e) => {
// 		const { name, value } = e.target;
// 		setPinData((prev) => ({ ...prev, [name]: value }));
// 	};

// 	const handleSelectChange = (value) => {
// 		setFormData((prev) => ({ ...prev, role: value }));
// 	};

// 	const handleUserFormSubmit = async (e) => {
// 		e.preventDefault();

// 		if (editingUser) {
// 			const updateData = {
// 				username: formData.username,
// 				email: formData.email,
// 				first_name: formData.first_name,
// 				last_name: formData.last_name,
// 			};

// 			if (isOwner || (isManager && editingUser.role === "CASHIER")) {
// 				updateData.role = formData.role;
// 			}

// 			updateUserMutation.mutate({ id: editingUser.id, userData: updateData });
// 		} else {
// 			createUserMutation.mutate(formData);
// 		}
// 	};

// 	const handlePinFormSubmit = async (e) => {
// 		e.preventDefault();
// 		setPinMutation.mutate({ userId: selectedUserForPin.id, pinData });
// 	};

// 	// Dialog handlers
// 	const openCreateDialog = () => {
// 		setEditingUser(null);
// 		setFormData({
// 			username: "",
// 			email: "",
// 			role: "CASHIER",
// 			password: "",
// 			first_name: "",
// 			last_name: "",
// 		});
// 		setIsUserDialogOpen(true);
// 	};

// 	const openEditDialog = (targetUser) => {
// 		setEditingUser(targetUser);
// 		setFormData({
// 			username: targetUser.username,
// 			email: targetUser.email,
// 			role: targetUser.role,
// 			password: "",
// 			first_name: targetUser.first_name || "",
// 			last_name: targetUser.last_name || "",
// 		});
// 		setIsUserDialogOpen(true);
// 	};

// 	const openPinDialog = (targetUser) => {
// 		setSelectedUserForPin(targetUser);
// 		setPinData({ pin: "" });
// 		setIsPinDialogOpen(true);
// 	};

// 	const closeUserDialog = () => {
// 		setIsUserDialogOpen(false);
// 		setEditingUser(null);
// 	};

// 	const closePinDialog = () => {
// 		setIsPinDialogOpen(false);
// 		setSelectedUserForPin(null);
// 	};

// 	const isSelfEditingCashier = isCashier;

// 	const headers = [
// 		{ label: "Name" },
// 		{ label: "Username" },
// 		{ label: "Email" },
// 		{ label: "Role" },
// 		{ label: "Actions", className: "text-right" },
// 	];

// 	const renderUserRow = (targetUser) => (
// 		<>
// 			<TableCell className="font-medium">
// 				{`${targetUser.first_name || ""} ${
// 					targetUser.last_name || ""
// 				}`.trim() || "N/A"}
// 			</TableCell>
// 			<TableCell>{targetUser.username}</TableCell>
// 			<TableCell>{targetUser.email}</TableCell>
// 			<TableCell>
// 				<Badge variant="outline">{ROLES[targetUser.role]}</Badge>
// 			</TableCell>
// 			<TableCell
// 				onClick={(e) => e.stopPropagation()}
// 				className="text-right"
// 			>
// 				<DropdownMenu>
// 					<DropdownMenuTrigger asChild>
// 						<Button
// 							variant="ghost"
// 							size="icon"
// 						>
// 							<MoreHorizontal className="h-4 w-4" />
// 						</Button>
// 					</DropdownMenuTrigger>
// 					<DropdownMenuContent align="end">
// 						<DropdownMenuLabel>Actions</DropdownMenuLabel>
// 						{canEditUser(targetUser) && (
// 							<DropdownMenuItem onClick={() => openEditDialog(targetUser)}>
// 								<Edit className="mr-2 h-4 w-4" />
// 								Edit
// 							</DropdownMenuItem>
// 						)}
// 						{canSetPin(targetUser) && (
// 							<DropdownMenuItem onClick={() => openPinDialog(targetUser)}>
// 								<KeyRound className="mr-2 h-4 w-4" />
// 								Set PIN
// 							</DropdownMenuItem>
// 						)}
// 						{canDeleteUser(targetUser) && (
// 							<DropdownMenuItem
// 								onClick={() => handleDelete(targetUser.id, targetUser)}
// 								className="text-destructive"
// 							>
// 								<Trash2 className="mr-2 h-4 w-4" />
// 								Delete
// 							</DropdownMenuItem>
// 						)}
// 					</DropdownMenuContent>
// 				</DropdownMenu>
// 			</TableCell>
// 		</>
// 	);

// 	const headerActions = canCreateUsers ? (
// 		<Button onClick={openCreateDialog}>
// 			<UserPlus className="mr-2 h-4 w-4" />
// 			Create User
// 		</Button>
// 	) : null;

// 	return (
// 		<>
// 			<DomainPageLayout
// 				pageTitle={isSelfEditingCashier ? "My Profile" : "User Management"}
// 				pageDescription={
// 					isSelfEditingCashier
// 						? "Manage your personal information and settings."
// 						: "Manage users in your system."
// 				}
// 				pageIcon={Users}
// 				pageActions={headerActions}
// 				title="Filters & Search"
// 				searchPlaceholder="Search by name, username, email, or role..."
// 				searchValue={filters.search}
// 				onSearchChange={handleSearchChange}
// 				error={error?.message}
// 			>
// 				<StandardTable
// 					headers={headers}
// 					data={filteredUsers}
// 					loading={isLoading}
// 					emptyMessage="No users found for the selected filters."
// 					renderRow={renderUserRow}
// 				/>
// 			</DomainPageLayout>

// 			{/* User Create/Edit Dialog */}
// 			<Dialog
// 				open={isUserDialogOpen}
// 				onOpenChange={setIsUserDialogOpen}
// 			>
// 				<DialogContent className="sm:max-w-[425px]">
// 					<DialogHeader>
// 						<DialogTitle>
// 							{editingUser ? "Edit User" : "Create User"}
// 						</DialogTitle>
// 						<DialogDescription>
// 							{editingUser
// 								? "Update the user's information."
// 								: "Create a new user for your system."}
// 						</DialogDescription>
// 					</DialogHeader>
// 					<form onSubmit={handleUserFormSubmit}>
// 						<div className="grid gap-4 py-4">
// 							<div className="grid grid-cols-4 items-center gap-4">
// 								<Label
// 									htmlFor="email"
// 									className="text-right"
// 								>
// 									Email
// 								</Label>
// 								<Input
// 									id="email"
// 									name="email"
// 									type="email"
// 									value={formData.email}
// 									onChange={handleFormChange}
// 									className="col-span-3"
// 									required
// 								/>
// 							</div>
// 							<div className="grid grid-cols-4 items-center gap-4">
// 								<Label
// 									htmlFor="username"
// 									className="text-right"
// 								>
// 									Username
// 								</Label>
// 								<Input
// 									id="username"
// 									name="username"
// 									value={formData.username}
// 									onChange={handleFormChange}
// 									className="col-span-3"
// 									required
// 								/>
// 							</div>
// 							<div className="grid grid-cols-4 items-center gap-4">
// 								<Label
// 									htmlFor="first_name"
// 									className="text-right"
// 								>
// 									First Name
// 								</Label>
// 								<Input
// 									id="first_name"
// 									name="first_name"
// 									value={formData.first_name}
// 									onChange={handleFormChange}
// 									className="col-span-3"
// 								/>
// 							</div>
// 							<div className="grid grid-cols-4 items-center gap-4">
// 								<Label
// 									htmlFor="last_name"
// 									className="text-right"
// 								>
// 									Last Name
// 								</Label>
// 								<Input
// 									id="last_name"
// 									name="last_name"
// 									value={formData.last_name}
// 									onChange={handleFormChange}
// 									className="col-span-3"
// 								/>
// 							</div>
// 							{((!editingUser && canCreateUsers) ||
// 								(editingUser &&
// 									(isOwner ||
// 										(isManager && editingUser.role === "CASHIER")))) && (
// 								<div className="grid grid-cols-4 items-center gap-4">
// 									<Label
// 										htmlFor="role"
// 										className="text-right"
// 									>
// 										Role
// 									</Label>
// 									<Select
// 										onValueChange={handleSelectChange}
// 										defaultValue={formData.role}
// 										value={formData.role}
// 									>
// 										<SelectTrigger className="col-span-3">
// 											<SelectValue placeholder="Select a role" />
// 										</SelectTrigger>
// 										<SelectContent>
// 											{(editingUser
// 												? Object.keys(EDITABLE_ROLES)
// 												: getAvailableRolesForCreation()
// 											).map((roleKey) => (
// 												<SelectItem
// 													key={roleKey}
// 													value={roleKey}
// 												>
// 													{ROLES[roleKey]}
// 												</SelectItem>
// 											))}
// 										</SelectContent>
// 									</Select>
// 								</div>
// 							)}
// 							{!editingUser && (
// 								<div className="grid grid-cols-4 items-center gap-4">
// 									<Label
// 										htmlFor="password"
// 										className="text-right"
// 									>
// 										Password
// 									</Label>
// 									<Input
// 										id="password"
// 										name="password"
// 										type="password"
// 										value={formData.password}
// 										onChange={handleFormChange}
// 										className="col-span-3"
// 										required
// 									/>
// 								</div>
// 							)}
// 						</div>
// 						<DialogFooter>
// 							<Button
// 								type="button"
// 								variant="outline"
// 								onClick={closeUserDialog}
// 							>
// 								Cancel
// 							</Button>
// 							<Button type="submit">
// 								{createUserMutation.isPending || updateUserMutation.isPending
// 									? "Saving..."
// 									: "Save"}
// 							</Button>
// 						</DialogFooter>
// 					</form>
// 				</DialogContent>
// 			</Dialog>

// 			{/* PIN Setting Dialog */}
// 			<Dialog
// 				open={isPinDialogOpen}
// 				onOpenChange={setIsPinDialogOpen}
// 			>
// 				<DialogContent className="sm:max-w-[425px]">
// 					<DialogHeader>
// 						<DialogTitle>
// 							Set PIN for {selectedUserForPin?.username}
// 						</DialogTitle>
// 						<DialogDescription>
// 							Set a 4-6 digit PIN for POS system access.
// 						</DialogDescription>
// 					</DialogHeader>
// 					<form onSubmit={handlePinFormSubmit}>
// 						<div className="grid gap-4 py-4">
// 							<div className="grid grid-cols-4 items-center gap-4">
// 								<Label
// 									htmlFor="pin"
// 									className="text-right"
// 								>
// 									PIN
// 								</Label>
// 								<Input
// 									id="pin"
// 									name="pin"
// 									type="password"
// 									value={pinData.pin}
// 									onChange={handlePinChange}
// 									className="col-span-3"
// 									maxLength={6}
// 									pattern="[0-9]{4,6}"
// 									placeholder="Enter 4-6 digit PIN"
// 									required
// 								/>
// 							</div>
// 						</div>
// 						<DialogFooter>
// 							<Button
// 								type="button"
// 								variant="outline"
// 								onClick={closePinDialog}
// 							>
// 								Cancel
// 							</Button>
// 							<Button type="submit">
// 								{setPinMutation.isPending ? "Setting..." : "Set PIN"}
// 							</Button>
// 						</DialogFooter>
// 					</form>
// 				</DialogContent>
// 			</Dialog>

// 			{confirmation.dialog}
// 		</>
// 	);
// }
