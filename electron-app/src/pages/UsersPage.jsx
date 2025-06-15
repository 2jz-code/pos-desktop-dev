import { useEffect, useState } from "react";
import {
	getUsers,
	deleteUser,
	createUser,
	updateUser,
	setPin,
} from "../api/services/userService";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
import { useToast } from "@/components/ui/use-toast";
import { MoreHorizontal, User } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
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
	const [users, setUsers] = useState([]);
	const [filteredUsers, setFilteredUsers] = useState([]);
	const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
	const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
	const [editingUser, setEditingUser] = useState(null);
	const [selectedUserForPin, setSelectedUserForPin] = useState(null);
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
		// No longer filter users based on role, show everyone
		setFilteredUsers([...users]);
	}, [users]);

	const fetchUsers = async () => {
		try {
			const response = await getUsers();
			setUsers(response.data);
		} catch (error) {
			console.error("Failed to fetch users:", error);
			toast({
				title: "Error",
				description: "Failed to fetch users.",
				variant: "destructive",
			});
		}
	};

	const handleDelete = async (userId) => {
		try {
			await deleteUser(userId);
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
			fetchUsers();
			closeUserDialog();
		} catch (error) {
			console.error("Failed to save user:", error);
			const errorMsg =
				error.response?.data?.detail ||
				error.response?.data?.non_field_errors?.[0] ||
				"Failed to save user.";
			toast({
				title: "Error",
				description: errorMsg,
				variant: "destructive",
			});
		}
	};

	const handlePinFormSubmit = async (e) => {
		e.preventDefault();
		if (!selectedUserForPin) return;

		try {
			await setPin(selectedUserForPin.id, pinData.pin);
			toast({
				title: "Success",
				description: "PIN set successfully.",
			});
			closePinDialog();
		} catch (error) {
			console.error("Failed to set PIN:", error);
			const errorMsg = error.response?.data?.pin?.[0] || "Failed to set PIN.";
			toast({
				title: "Error",
				description: errorMsg,
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
			username: targetUser.username || "",
			email: targetUser.email || "",
			role: targetUser.role || "CASHIER",
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

	return (
		<Card>
			<CardHeader>
				<div className="flex justify-between items-start">
					<div>
						<CardTitle>
							{isSelfEditingCashier ? "My Profile" : "User Management"}
						</CardTitle>
						<CardDescription>
							{isSelfEditingCashier
								? "Manage your personal information and settings."
								: "Manage users in your system."}
						</CardDescription>
					</div>
					{canCreateUsers && (
						<Button onClick={openCreateDialog}>Create User</Button>
					)}
				</div>
			</CardHeader>
			<CardContent>
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
										required
										minLength={4}
										maxLength={6}
										pattern="[0-9]{4,6}"
										placeholder="Enter 4-6 digits"
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

				{filteredUsers.length > 0 ? (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Username</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Name</TableHead>
									<TableHead>Role</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredUsers.map((targetUser) => (
									<TableRow key={targetUser.id}>
										<TableCell>{targetUser.username}</TableCell>
										<TableCell>{targetUser.email}</TableCell>
										<TableCell>
											{`${targetUser.first_name || ""} ${
												targetUser.last_name || ""
											}`.trim() || "-"}
										</TableCell>
										<TableCell>
											<span
												className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
													targetUser.role === "OWNER"
														? "bg-purple-100 text-purple-800"
														: targetUser.role === "MANAGER"
														? "bg-blue-100 text-blue-800"
														: "bg-green-100 text-green-800"
												}`}
											>
												{ROLES[targetUser.role]}
											</span>
										</TableCell>
										<TableCell className="text-right">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														className="h-8 w-8 p-0"
													>
														<span className="sr-only">Open menu</span>
														<MoreHorizontal className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuLabel>Actions</DropdownMenuLabel>
													{canEditUser(targetUser) && (
														<DropdownMenuItem
															onClick={() => openEditDialog(targetUser)}
														>
															<User className="mr-2 h-4 w-4" />
															Edit
														</DropdownMenuItem>
													)}
													{canSetPin(targetUser) && (
														<DropdownMenuItem
															onClick={() => openPinDialog(targetUser)}
														>
															Set PIN
														</DropdownMenuItem>
													)}
													{canDeleteUser(targetUser) && (
														<DropdownMenuItem
															onClick={() => handleDelete(targetUser.id)}
															className="text-red-600"
														>
															Delete
														</DropdownMenuItem>
													)}
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : (
					<div className="text-center py-8 text-muted-foreground">
						No users found.
					</div>
				)}
			</CardContent>
		</Card>
	);
}
