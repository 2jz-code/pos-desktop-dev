import React, { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
	Store,
	Save,
	X,
	Loader2,
	CheckCircle,
	AlertCircle,
} from "lucide-react";
import { useBusinessSettingsStore } from "@/domains/settings/store/businessSettingsStore";
import { useToast } from "@/shared/components/ui/use-toast";

export const BusinessStoreInfo = () => {
	const {
		storeInfo,
		isLoadingStore,
		storeError,
		fetchStoreInfo,
		updateStoreInfo,
	} = useBusinessSettingsStore();

	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [formData, setFormData] = useState({
		store_name: "",
		store_address: "",
		store_phone: "",
		store_email: "",
	});
	const [formErrors, setFormErrors] = useState({});
	const { toast } = useToast();

	useEffect(() => {
		fetchStoreInfo();
	}, [fetchStoreInfo]);

	// Update form data when store info loads
	useEffect(() => {
		if (storeInfo) {
			setFormData({
				store_name: storeInfo.store_name || "",
				store_address: storeInfo.store_address || "",
				store_phone: storeInfo.store_phone || "",
				store_email: storeInfo.store_email || "",
			});
		}
	}, [storeInfo]);

	const handleInputChange = (field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
		// Clear error for this field when user starts typing
		if (formErrors[field]) {
			setFormErrors((prev) => ({ ...prev, [field]: null }));
		}
	};

	const validateForm = () => {
		const errors = {};

		if (!formData.store_name.trim()) {
			errors.store_name = "Store name is required";
		}

		if (formData.store_email && !isValidEmail(formData.store_email)) {
			errors.store_email = "Please enter a valid email address";
		}

		setFormErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const isValidEmail = (email) => {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	};

	const handleSave = async () => {
		if (!validateForm()) {
			return;
		}

		setIsSaving(true);
		try {
			await updateStoreInfo(formData);
			setIsEditing(false);
			toast({
				title: "Success",
				description: "Store information updated successfully",
				variant: "default",
			});
		} catch (error) {
			console.error("Failed to update store info:", error);
			toast({
				title: "Error",
				description: error.message || "Failed to update store information",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		// Reset form data to original values
		if (storeInfo) {
			setFormData({
				store_name: storeInfo.store_name || "",
				store_address: storeInfo.store_address || "",
				store_phone: storeInfo.store_phone || "",
				store_email: storeInfo.store_email || "",
			});
		}
		setFormErrors({});
		setIsEditing(false);
	};

	const hasChanges = () => {
		if (!storeInfo) return false;
		return (
			formData.store_name !== (storeInfo.store_name || "") ||
			formData.store_address !== (storeInfo.store_address || "") ||
			formData.store_phone !== (storeInfo.store_phone || "") ||
			formData.store_email !== (storeInfo.store_email || "")
		);
	};

	if (isLoadingStore) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Store className="h-4 w-4" />
						Store Information
						<Badge
							variant="outline"
							className="flex items-center gap-1"
						>
							<CheckCircle className="h-3 w-3" />
							Editable
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-6">
					<div className="flex items-center gap-2">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span>Loading store information...</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (storeError) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Store className="h-4 w-4" />
						Store Information
						<Badge
							variant="outline"
							className="flex items-center gap-1"
						>
							<AlertCircle className="h-3 w-3" />
							Error
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Alert variant="destructive">
						<AlertDescription>
							<strong>Error:</strong> {storeError}
						</AlertDescription>
					</Alert>
					<Button
						onClick={() => fetchStoreInfo()}
						className="mt-4"
					>
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Store className="h-4 w-4" />
					Store Information
					<Badge
						variant="outline"
						className="flex items-center gap-1"
					>
						<CheckCircle className="h-3 w-3" />
						Editable
					</Badge>
				</CardTitle>
				<CardDescription>
					Basic store information displayed on receipts and reports
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isEditing ? (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="store_name">Store Name *</Label>
								<Input
									id="store_name"
									value={formData.store_name}
									onChange={(e) =>
										handleInputChange("store_name", e.target.value)
									}
									placeholder="Enter store name"
									className={formErrors.store_name ? "border-destructive" : ""}
								/>
								{formErrors.store_name && (
									<p className="text-sm text-destructive">
										{formErrors.store_name}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="store_phone">Phone Number</Label>
								<Input
									id="store_phone"
									value={formData.store_phone}
									onChange={(e) =>
										handleInputChange("store_phone", e.target.value)
									}
									placeholder="Enter phone number"
									type="tel"
								/>
							</div>

							<div className="space-y-2 md:col-span-2">
								<Label htmlFor="store_address">Address</Label>
								<Textarea
									id="store_address"
									value={formData.store_address}
									onChange={(e) =>
										handleInputChange("store_address", e.target.value)
									}
									placeholder="Enter store address"
									rows={3}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="store_email">Email</Label>
								<Input
									id="store_email"
									value={formData.store_email}
									onChange={(e) =>
										handleInputChange("store_email", e.target.value)
									}
									placeholder="Enter email address"
									type="email"
									className={formErrors.store_email ? "border-destructive" : ""}
								/>
								{formErrors.store_email && (
									<p className="text-sm text-destructive">
										{formErrors.store_email}
									</p>
								)}
							</div>
						</div>

						<div className="flex justify-end gap-2 pt-4 border-t">
							<Button
								onClick={handleCancel}
								variant="outline"
								disabled={isSaving}
							>
								<X className="mr-2 h-4 w-4" />
								Cancel
							</Button>
							<Button
								onClick={handleSave}
								disabled={isSaving || !hasChanges()}
							>
								{isSaving ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Save className="mr-2 h-4 w-4" />
								)}
								{isSaving ? "Saving..." : "Save Changes"}
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Store Name
								</label>
								<p className="text-sm">{storeInfo?.store_name || "Not set"}</p>
							</div>

							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Phone Number
								</label>
								<p className="text-sm">{storeInfo?.store_phone || "Not set"}</p>
							</div>

							<div className="space-y-1 md:col-span-2">
								<label className="text-sm font-medium text-muted-foreground">
									Address
								</label>
								<p className="text-sm whitespace-pre-wrap">
									{storeInfo?.store_address || "Not set"}
								</p>
							</div>

							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Email
								</label>
								<p className="text-sm">{storeInfo?.store_email || "Not set"}</p>
							</div>
						</div>

						<div className="flex justify-end pt-4 border-t">
							<Button
								onClick={() => setIsEditing(true)}
								variant="default"
							>
								Edit Store Information
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
};
