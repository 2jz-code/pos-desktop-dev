import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getUsers,
	archiveUser,
	unarchiveUser,
	createUser,
	updateUser,
	setPin,
} from "@/services/api/userService";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import {
	MoreHorizontal,
	UserPlus,
	KeyRound,
	Archive,
	ArchiveRestore,
	Edit,
	Users,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { useAuth } from "@/contexts/AuthContext";

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

// Roles that can be assigned/edited in the Admin UI
const EDITABLE_ROLES = {
	OWNER: "Owner",
	MANAGER: "Manager",
	CASHIER: "Cashier",
};

interface User {
	id: string;
	username: string;
	email: string;
	first_name?: string;
	last_name?: string;
	role: string;
	is_active: boolean;
}

interface FormData {
	username: string;
	email: string;
	role: string;
	password: string;
	first_name: string;
	last_name: string;
}

interface PinData {
	pin: string;
}

interface Filters {
	search: string;
}

export function UsersPage() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const confirmation = useConfirmation();

	// State for dialogs and forms
	const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
	const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
	const [editingUser, setEditingUser] = useState<User | null>(null);
	const [selectedUserForPin, setSelectedUserForPin] = useState<User | null>(null);
	const [showArchivedUsers, setShowArchivedUsers] = useState(false);
	const [filters, setFilters] = useState<Filters>({
		search: "",
	});
	const [formData, setFormData] = useState<FormData>({
		username: "",
		email: "",
		role: "CASHIER",
		password: "",
		first_name: "",
		last_name: "",
	});
	const [pinData, setPinData] = useState<PinData>({ pin: "" });

	// Permission checks - Admin site should be owner-only but keeping logic for future
	const isOwner = user?.role === "OWNER";
	const isManager = user?.role === "MANAGER";
	const isCashier = user?.role === "CASHIER";

	const canCreateUsers = isOwner || isManager;

	const canEditUser = (targetUser: User) => {
		if (!user) return false;
		if (user.id === targetUser.id) return true;
		if (isCashier) return false;
		if (isManager) return targetUser.role === "CASHIER";
		if (isOwner) return true;
		return false;
	};

	const canArchiveUser = (targetUser: User) => {
		if (!user || user.id === targetUser.id) return false;
		if (isCashier) return false;
		if (isManager) return targetUser.role === "CASHIER";
		if (isOwner) return true;
		return false;
	};

	const canSetPin = (targetUser: User) => {
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
		return users.filter((u: User) => {
			const username = u.username?.toLowerCase() || "";
			const email = u.email?.toLowerCase() || "";
			const fullName = `${u.first_name || ""} ${u.last_name || ""}`
				.trim()
				.toLowerCase();
			const roleName = ROLES[u.role as keyof typeof ROLES]?.toLowerCase() || "";
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
			toast({
				title: "Error",
				description: "Failed to create user.",
				variant: "destructive",
			});
		},
	});

	const updateUserMutation = useMutation({
		mutationFn: ({ id, userData }: { id: string; userData: Partial<FormData> }) => updateUser(id, userData),
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
			toast({
				title: "Error",
				description: "Failed to update user.",
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
		mutationFn: ({ userId, pinData }: { userId: string; pinData: PinData }) => setPin(userId, pinData),
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
	const handleArchiveUser = async (userId: string, userToArchive: User) => {
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

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	};

	const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setPinData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSelectChange = (value: string) => {
		setFormData((prev) => ({ ...prev, role: value }));
	};

	const handleUserFormSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (editingUser) {
			const updateData: Partial<FormData> = {
				username: formData.username,
				email: formData.email,
				first_name: formData.first_name,
				last_name: formData.last_name,
			};

			if (isOwner || (isManager && editingUser.role === "CASHIER")) {
				updateData.role = formData.role;
			}

			updateUserMutation.mutate({ id: editingUser.id, userData: updateData });
		} else {
			createUserMutation.mutate(formData);
		}
	};

	const handlePinFormSubmit = async (e: React.FormEvent) => {
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
		});
		setIsUserDialogOpen(true);
	};

	const openEditDialog = (targetUser: User) => {
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

	const openPinDialog = (targetUser: User) => {
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
		{ label: "Status" },
		{ label: "Actions", className: "text-right" },
	];

	const renderUserRow = (targetUser: User) => (
		<>
			<TableCell className="font-medium">
				{`${targetUser.first_name || ""} ${
					targetUser.last_name || ""
				}`.trim() || "N/A"}
			</TableCell>
			<TableCell>{targetUser.username}</TableCell>
			<TableCell>{targetUser.email}</TableCell>
			<TableCell>
				<Badge variant="outline">{ROLES[targetUser.role as keyof typeof ROLES]}</Badge>
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
			<DomainPageLayout
				pageTitle={isSelfEditingCashier ? "My Profile" : showArchivedUsers ? "Archived Users" : "User Management"}
				pageDescription={
					isSelfEditingCashier
						? "Manage your personal information and settings."
						: showArchivedUsers
						? "View and restore archived users."
						: "Manage active users in your system."
				}
				pageIcon={Users}
				pageActions={headerActions}
				title="Filters & Search"
				searchPlaceholder="Search by name, username, email, or role..."
				searchValue={filters.search}
				onSearchChange={handleSearchChange}
				error={error?.message}
			>
				<StandardTable
					headers={headers}
					data={Array.isArray(filteredUsers) ? filteredUsers : []}
					loading={isLoading}
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
													{ROLES[roleKey as keyof typeof ROLES]}
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
							<Button type="submit">
								{createUserMutation.isPending || updateUserMutation.isPending
									? "Saving..."
									: "Save"}
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