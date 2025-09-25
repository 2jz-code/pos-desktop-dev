import { useState, useMemo } from "react";
import {
	getUsers,
	archiveUser,
	unarchiveUser,
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
import {
	MoreHorizontal,
	UserPlus,
	KeyRound,
	Archive,
	ArchiveRestore,
	Edit,
	Users,
	Search,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { StandardTable } from "@/shared/components/layout";
import { PageHeader } from "@/shared/components/layout/PageHeader";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const confirmation = useConfirmation();

	// State for dialogs and forms
	const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
	const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
	const [editingUser, setEditingUser] = useState(null);
	const [selectedUserForPin, setSelectedUserForPin] = useState(null);
	const [showArchivedUsers, setShowArchivedUsers] = useState(false);
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
		phone_number: "",
	});
	const [pinData, setPinData] = useState({ pin: "" });

	// Permission checks
	const canCreateUsers = isOwner || isManager;

	const canEditUser = (targetUser) => {
		if (!user) return false;
		if (user.id === targetUser.id) return true;
		if (isCashier) return false;
		if (isManager) return targetUser.role === "CASHIER";
		if (isOwner) return true;
		return false;
	};

	const canArchiveUser = (targetUser) => {
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

	// Fetch users
	const {
		data: users = [],
		isLoading,
		error,
	} = useQuery({
		queryKey: ["users", showArchivedUsers],
		queryFn: () => {
			const params = showArchivedUsers ? { include_archived: 'only' } : {};
			return getUsers(params).then((res) => res.data?.results || res.data || []);
		},
	});

	// Filter users based on search
	const filteredUsers = useMemo(() => {
		if (!filters.search) return users;

		const searchLower = filters.search.toLowerCase();
		return users.filter((u) => {
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
	}, [users, filters.search]);

	// Mutations
	const createUserMutation = useMutation({
		mutationFn: createUser,
		onSuccess: () => {
			toast({
				title: "Success",
				description: "User created successfully.",
			});
			queryClient.invalidateQueries({ queryKey: ["users"] });
			closeUserDialog();
		},
		onError: (error) => {
			console.error("Failed to create user:", error);
			const errorMessage = error?.response?.data?.email?.[0] ||
							   error?.response?.data?.username?.[0] ||
							   error?.response?.data?.error ||
							   "Failed to create user.";
			toast({
				title: "Error",
				description: errorMessage,
				variant: "destructive",
			});
		},
	});

	const updateUserMutation = useMutation({
		mutationFn: ({ id, userData }) => updateUser(id, userData),
		onSuccess: () => {
			toast({
				title: "Success",
				description: "User updated successfully.",
			});
			queryClient.invalidateQueries({ queryKey: ["users"] });
			closeUserDialog();
		},
		onError: (error) => {
			console.error("Failed to update user:", error);
			const errorMessage = error?.response?.data?.email?.[0] ||
							   error?.response?.data?.username?.[0] ||
							   error?.response?.data?.error ||
							   "Failed to update user.";
			toast({
				title: "Error",
				description: errorMessage,
				variant: "destructive",
			});
		},
	});

	const archiveUserMutation = useMutation({
		mutationFn: archiveUser,
		onSuccess: () => {
			toast({
				title: "Success",
				description: "User archived successfully.",
			});
			queryClient.invalidateQueries({ queryKey: ["users"] });
		},
		onError: (error) => {
			console.error("Failed to archive user:", error);
			toast({
				title: "Error",
				description: "Failed to archive user.",
				variant: "destructive",
			});
		},
	});

	const unarchiveUserMutation = useMutation({
		mutationFn: unarchiveUser,
		onSuccess: () => {
			toast({
				title: "Success",
				description: "User restored successfully.",
			});
			queryClient.invalidateQueries({ queryKey: ["users"] });
		},
		onError: (error) => {
			console.error("Failed to restore user:", error);
			toast({
				title: "Error",
				description: "Failed to restore user.",
				variant: "destructive",
			});
		},
	});

	const setPinMutation = useMutation({
		mutationFn: ({ userId, pinData }) => setPin(userId, pinData.pin),
		onSuccess: () => {
			toast({
				title: "Success",
				description: "PIN set successfully.",
			});
			closePinDialog();
		},
		onError: (error) => {
			console.error("Failed to set PIN:", error);
			toast({
				title: "Error",
				description: "Failed to set PIN.",
				variant: "destructive",
			});
		},
	});

	// Event handlers
	const handleArchiveUser = async (userId, userToArchive) => {
		if (showArchivedUsers) {
			// Unarchive/restore user
			confirmation.show({
				title: "Restore User",
				description: `Are you sure you want to restore "${userToArchive.first_name} ${userToArchive.last_name}"?`,
				variant: "default",
				confirmText: "Restore",
				onConfirm: () => {
					unarchiveUserMutation.mutate(userId);
				}
			});
		} else {
			// Archive user
			confirmation.show({
				title: "Archive User",
				description: `Are you sure you want to archive "${userToArchive.first_name} ${userToArchive.last_name}"? They will no longer be able to access the system.`,
				variant: "destructive",
				confirmText: "Archive",
				onConfirm: () => {
					archiveUserMutation.mutate(userId);
				}
			});
		}
	};

	const toggleArchivedView = () => {
		setShowArchivedUsers(!showArchivedUsers);
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

		if (editingUser) {
			const updateData = {
				username: formData.username,
				email: formData.email,
				first_name: formData.first_name,
				last_name: formData.last_name,
				phone_number: formData.phone_number,
			};

			if (isOwner || (isManager && editingUser.role === "CASHIER")) {
				updateData.role = formData.role;
			}

			updateUserMutation.mutate({ id: editingUser.id, userData: updateData });
		} else {
			createUserMutation.mutate(formData);
		}
	};

	const handlePinFormSubmit = async (e) => {
		e.preventDefault();
		if (selectedUserForPin) {
			setPinMutation.mutate({ userId: selectedUserForPin.id, pinData });
		}
	};

	// Dialog handlers
	const openCreateDialog = () => {
		setEditingUser(null);
		setFormData({
			username: "",
			email: "",
			role: "CASHIER",
			password: "",
			first_name: "",
			last_name: "",
			phone_number: "",
		});
		setIsUserDialogOpen(true);
	};

	const openEditDialog = (targetUser) => {
		setEditingUser(targetUser);
		setFormData({
			username: targetUser.username || "",
			email: targetUser.email || "",
			role: targetUser.role || "CASHIER",
			password: "",
			first_name: targetUser.first_name || "",
			last_name: targetUser.last_name || "",
			phone_number: targetUser.phone_number || "",
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

	const headers = [
		{ label: "Name" },
		{ label: "Username" },
		{ label: "Email" },
		{ label: "Role" },
		{ label: "Status" },
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
			<TableCell>
				<Badge variant={targetUser.is_active ? "default" : "secondary"}>
					{targetUser.is_active ? "Active" : "Archived"}
				</Badge>
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
						{canArchiveUser(targetUser) && (
							<DropdownMenuItem
								onClick={() => handleArchiveUser(targetUser.id, targetUser)}
								className={showArchivedUsers ? "text-green-600" : "text-destructive"}
							>
								{showArchivedUsers ? (
									<>
										<ArchiveRestore className="mr-2 h-4 w-4" />
										Restore
									</>
								) : (
									<>
										<Archive className="mr-2 h-4 w-4" />
										Archive
									</>
								)}
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</>
	);

	const headerActions = (
		<div className="flex gap-2">
			<Button variant="outline" onClick={toggleArchivedView}>
				{showArchivedUsers ? (
					<>
						<ArchiveRestore className="mr-2 h-4 w-4" />
						Show Active Users
					</>
				) : (
					<>
						<Archive className="mr-2 h-4 w-4" />
						Show Archived Users
					</>
				)}
			</Button>
			{canCreateUsers && (
				<Button onClick={openCreateDialog}>
					<UserPlus className="mr-2 h-4 w-4" />
					Create User
				</Button>
			)}
		</div>
	);

	return (
		<>
			<div className="flex flex-col h-full">
				{/* Page Header */}
				<PageHeader
					icon={Users}
					title={showArchivedUsers ? "Archived Users" : "User Management"}
					description={
						showArchivedUsers
							? "View and restore archived users."
							: "Manage active users in your system."
					}
					actions={headerActions}
					className="shrink-0"
				/>

				{/* Search and Filters */}
				<div className="border-b bg-background/95 backdrop-blur-sm p-4 space-y-4">
					<div className="relative max-w-md">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search by name, username, email, or role..."
							className="pl-10 h-11"
							value={filters.search}
							onChange={handleSearchChange}
						/>
					</div>
					{error?.message && (
						<div className="text-sm text-destructive">{error.message}</div>
					)}
				</div>

				{/* Main Content */}
				<div className="flex-1 min-h-0 p-4">
					<ScrollArea className="h-full">
						<div className="pb-6">
							<StandardTable
								headers={headers}
								data={Array.isArray(filteredUsers) ? filteredUsers : []}
								loading={isLoading}
								emptyMessage="No users found for the selected filters."
								renderRow={renderUserRow}
							/>
						</div>
					</ScrollArea>
				</div>
			</div>

			{/* User Create/Edit Dialog */}
			<Dialog
				open={isUserDialogOpen}
				onOpenChange={setIsUserDialogOpen}
			>
				<DialogContent className="sm:max-w-[500px]">
					<DialogHeader>
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
								{editingUser ? <Edit className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
							</div>
							<div>
								<DialogTitle className="text-foreground">
									{editingUser ? "Edit User" : "Create User"}
								</DialogTitle>
								<DialogDescription className="text-muted-foreground">
									{editingUser
										? "Update the user's information and permissions."
										: "Create a new user account for your system."}
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>
					<form onSubmit={handleUserFormSubmit}>
						<div className="space-y-4 py-4">
							{/* Basic Information Section */}
							<div className="space-y-4">
								<div className="border-b border-border/60 pb-2">
									<h4 className="text-sm font-medium text-foreground">Basic Information</h4>
								</div>

								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="first_name" className="text-sm font-medium text-foreground">
											First Name
										</Label>
										<Input
											id="first_name"
											name="first_name"
											value={formData.first_name}
											onChange={handleFormChange}
											placeholder="Enter first name"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="last_name" className="text-sm font-medium text-foreground">
											Last Name
										</Label>
										<Input
											id="last_name"
											name="last_name"
											value={formData.last_name}
											onChange={handleFormChange}
											placeholder="Enter last name"
										/>
									</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="email" className="text-sm font-medium text-foreground">
										Email Address <span className="text-destructive">*</span>
									</Label>
									<Input
										id="email"
										name="email"
										type="email"
										value={formData.email}
										onChange={handleFormChange}
										placeholder="Enter email address"
										required
									/>
									<p className="text-xs text-muted-foreground">
										This will be used for login and notifications
									</p>
								</div>

								<div className="space-y-2">
									<Label htmlFor="username" className="text-sm font-medium text-foreground">
										Username
									</Label>
									<Input
										id="username"
										name="username"
										value={formData.username}
										onChange={handleFormChange}
										placeholder="Enter username (optional)"
									/>
									<p className="text-xs text-muted-foreground">
										Leave blank to use email as username
									</p>
								</div>

								<div className="space-y-2">
									<Label htmlFor="phone_number" className="text-sm font-medium text-foreground">
										Phone Number
									</Label>
									<Input
										id="phone_number"
										name="phone_number"
										type="tel"
										value={formData.phone_number}
										onChange={handleFormChange}
										placeholder="Enter phone number"
									/>
								</div>
							</div>

							{/* Security & Access Section */}
							<div className="space-y-4">
								<div className="border-b border-border/60 pb-2">
									<h4 className="text-sm font-medium text-foreground">Security & Access</h4>
								</div>

								{((!editingUser && canCreateUsers) ||
									(editingUser &&
										(isOwner ||
											(isManager && editingUser.role === "CASHIER")))) && (
									<div className="space-y-2">
										<Label htmlFor="role" className="text-sm font-medium text-foreground">
											Role <span className="text-destructive">*</span>
										</Label>
										<Select
											onValueChange={handleSelectChange}
											defaultValue={formData.role}
											value={formData.role}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select user role" />
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
														<div className="flex items-center gap-2">
															<span>{ROLES[roleKey]}</span>
															<Badge variant="outline" className="text-xs">
																{roleKey.toLowerCase()}
															</Badge>
														</div>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<p className="text-xs text-muted-foreground">
											Defines what the user can access and modify
										</p>
									</div>
								)}

								{!editingUser && (
									<div className="space-y-2">
										<Label htmlFor="password" className="text-sm font-medium text-foreground">
											Password <span className="text-destructive">*</span>
										</Label>
										<Input
											id="password"
											name="password"
											type="password"
											value={formData.password}
											onChange={handleFormChange}
											placeholder="Enter secure password"
											required
										/>
										<p className="text-xs text-muted-foreground">
											Minimum 8 characters with letters and numbers
										</p>
									</div>
								)}

								{editingUser && (
									<div className="p-3 bg-muted/20 rounded-lg border border-border/40">
										<div className="flex items-center gap-2 text-sm text-muted-foreground">
											<KeyRound className="h-4 w-4" />
											<span>Use "Set PIN" action to update authentication credentials</span>
										</div>
									</div>
								)}
							</div>
						</div>
						<DialogFooter className="gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={closeUserDialog}
								disabled={createUserMutation.isPending || updateUserMutation.isPending}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={createUserMutation.isPending || updateUserMutation.isPending}
							>
								{createUserMutation.isPending || updateUserMutation.isPending ? (
									<>
										<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
										{editingUser ? "Updating..." : "Creating..."}
									</>
								) : (
									<>
										{editingUser ? "Update User" : "Create User"}
									</>
								)}
							</Button>
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
							<Button type="submit">
								{setPinMutation.isPending ? "Setting..." : "Set PIN"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{confirmation.dialog}
		</>
	);
}