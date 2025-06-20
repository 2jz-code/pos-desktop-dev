import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Clock,
	Save,
	X,
	Loader2,
	CheckCircle,
	AlertCircle,
	Globe,
	Info,
} from "lucide-react";
import { useBusinessSettingsStore } from "../../../store/businessSettingsStore";
import { useToast } from "@/components/ui/use-toast";

const BusinessHoursSettings = () => {
	const {
		businessHours,
		isLoadingHours,
		hoursError,
		fetchBusinessHours,
		updateBusinessHours,
	} = useBusinessSettingsStore();

	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [formData, setFormData] = useState({
		opening_time: "",
		closing_time: "",
		timezone: "UTC",
	});
	const [formErrors, setFormErrors] = useState({});
	const { toast } = useToast();

	// Common timezone options
	const timezones = [
		{ value: "UTC", label: "UTC" },
		{ value: "America/New_York", label: "Eastern Time (ET)" },
		{ value: "America/Chicago", label: "Central Time (CT)" },
		{ value: "America/Denver", label: "Mountain Time (MT)" },
		{ value: "America/Los_Angeles", label: "Pacific Time (PT)" },
		{ value: "America/Phoenix", label: "Arizona Time (MST)" },
		{ value: "America/Anchorage", label: "Alaska Time (AKT)" },
		{ value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
	];

	useEffect(() => {
		fetchBusinessHours();
	}, [fetchBusinessHours]);

	// Update form data when business hours load
	useEffect(() => {
		if (businessHours) {
			setFormData({
				opening_time: businessHours.opening_time || "",
				closing_time: businessHours.closing_time || "",
				timezone: businessHours.timezone || "UTC",
			});
		}
	}, [businessHours]);

	const handleInputChange = (field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
		// Clear error for this field when user starts typing
		if (formErrors[field]) {
			setFormErrors((prev) => ({ ...prev, [field]: null }));
		}
	};

	const validateForm = () => {
		const errors = {};

		// If one time is set, both should be set
		if (formData.opening_time && !formData.closing_time) {
			errors.closing_time = "Closing time is required when opening time is set";
		}
		if (formData.closing_time && !formData.opening_time) {
			errors.opening_time = "Opening time is required when closing time is set";
		}

		// Validate time format (HH:MM)
		const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
		if (formData.opening_time && !timeRegex.test(formData.opening_time)) {
			errors.opening_time = "Please enter a valid time (HH:MM)";
		}
		if (formData.closing_time && !timeRegex.test(formData.closing_time)) {
			errors.closing_time = "Please enter a valid time (HH:MM)";
		}

		setFormErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const handleSave = async () => {
		if (!validateForm()) {
			return;
		}

		setIsSaving(true);
		try {
			// Convert empty strings to null for the API
			const dataToSave = {
				opening_time: formData.opening_time || null,
				closing_time: formData.closing_time || null,
				timezone: formData.timezone,
			};

			await updateBusinessHours(dataToSave);
			setIsEditing(false);
			toast({
				title: "Success",
				description: "Business hours updated successfully",
				variant: "default",
			});
		} catch (error) {
			console.error("Failed to update business hours:", error);
			toast({
				title: "Error",
				description: error.message || "Failed to update business hours",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		// Reset form data to original values
		if (businessHours) {
			setFormData({
				opening_time: businessHours.opening_time || "",
				closing_time: businessHours.closing_time || "",
				timezone: businessHours.timezone || "UTC",
			});
		}
		setFormErrors({});
		setIsEditing(false);
	};

	const hasChanges = () => {
		if (!businessHours) return false;
		return (
			formData.opening_time !== (businessHours.opening_time || "") ||
			formData.closing_time !== (businessHours.closing_time || "") ||
			formData.timezone !== (businessHours.timezone || "UTC")
		);
	};

	const getBusinessStatus = () => {
		if (!businessHours?.opening_time || !businessHours?.closing_time) {
			return {
				status: "24/7 Available",
				color: "default",
				description: "No restrictions - online orders accepted anytime",
			};
		}

		// This is a simplified check - the real check happens in the backend
		const now = new Date();
		const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

		const openTime = businessHours.opening_time;
		const closeTime = businessHours.closing_time;

		// Simple same-day comparison (doesn't handle overnight hours perfectly)
		if (openTime <= closeTime) {
			// Normal hours (e.g., 9:00 - 17:00)
			const isOpen = currentTime >= openTime && currentTime <= closeTime;
			return {
				status: isOpen ? "Open for Online Orders" : "Closed for Online Orders",
				color: isOpen ? "default" : "secondary",
				description: isOpen
					? "Accepting online orders"
					: "Online orders blocked • POS still available",
			};
		} else {
			// Overnight hours (e.g., 22:00 - 06:00)
			const isOpen = currentTime >= openTime || currentTime <= closeTime;
			return {
				status: isOpen ? "Open for Online Orders" : "Closed for Online Orders",
				color: isOpen ? "default" : "secondary",
				description: isOpen
					? "Accepting online orders"
					: "Online orders blocked • POS still available",
			};
		}
	};

	if (isLoadingHours) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Clock className="h-4 w-4" />
						Business Hours
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-2 text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span>Loading business hours...</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (hoursError) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Clock className="h-4 w-4" />
						Business Hours
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
							<strong>Error:</strong> {hoursError}
						</AlertDescription>
					</Alert>
					<Button
						onClick={() => fetchBusinessHours()}
						className="mt-4"
					>
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}

	const businessStatus = getBusinessStatus();

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Clock className="h-4 w-4" />
					Business Hours
					<Badge
						variant="outline"
						className="flex items-center gap-1"
					>
						<CheckCircle className="h-3 w-3" />
						Editable
					</Badge>
					<Badge
						variant={businessStatus.color}
						className="ml-auto"
					>
						{businessStatus.status}
					</Badge>
				</CardTitle>
				<CardDescription className="space-y-2">
					<div>
						Configure when your business accepts online orders from customers.
						Your POS system remains fully functional 24/7 for in-person sales.
					</div>
					{businessStatus.description && (
						<div className="text-xs text-muted-foreground">
							{businessStatus.description}
						</div>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isEditing ? (
					<>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div className="space-y-2">
								<Label htmlFor="opening_time">
									Opening Time
									<span className="text-xs text-muted-foreground font-normal ml-1">
										(when online orders start)
									</span>
								</Label>
								<Input
									id="opening_time"
									type="time"
									placeholder="09:00"
									value={formData.opening_time}
									onChange={(e) =>
										handleInputChange("opening_time", e.target.value)
									}
									className={
										formErrors.opening_time ? "border-destructive" : ""
									}
								/>
								{formErrors.opening_time && (
									<p className="text-sm text-destructive">
										{formErrors.opening_time}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="closing_time">
									Closing Time
									<span className="text-xs text-muted-foreground font-normal ml-1">
										(when online orders stop)
									</span>
								</Label>
								<Input
									id="closing_time"
									type="time"
									placeholder="21:00"
									value={formData.closing_time}
									onChange={(e) =>
										handleInputChange("closing_time", e.target.value)
									}
									className={
										formErrors.closing_time ? "border-destructive" : ""
									}
								/>
								{formErrors.closing_time && (
									<p className="text-sm text-destructive">
										{formErrors.closing_time}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="timezone">Timezone</Label>
								<Select
									value={formData.timezone}
									onValueChange={(value) =>
										handleInputChange("timezone", value)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select timezone" />
									</SelectTrigger>
									<SelectContent>
										{timezones.map((tz) => (
											<SelectItem
												key={tz.value}
												value={tz.value}
											>
												<div className="flex items-center gap-2">
													<Globe className="h-4 w-4" />
													{tz.label}
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<Alert>
							<Info className="h-4 w-4" />
							<AlertDescription>
								<strong>Note:</strong> This only affects online orders from
								customers. Your POS system remains fully operational for
								in-person sales and management.
							</AlertDescription>
						</Alert>

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
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Opening Time
								</label>
								<p className="text-sm">
									{businessHours?.opening_time || "Not set (Always open)"}
								</p>
							</div>

							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Closing Time
								</label>
								<p className="text-sm">
									{businessHours?.closing_time || "Not set (Always open)"}
								</p>
							</div>

							<div className="space-y-1">
								<label className="text-sm font-medium text-muted-foreground">
									Timezone
								</label>
								<p className="text-sm">
									{timezones.find((tz) => tz.value === businessHours?.timezone)
										?.label ||
										businessHours?.timezone ||
										"UTC"}
								</p>
							</div>
						</div>

						<div className="flex justify-end pt-4 border-t">
							<Button
								onClick={() => setIsEditing(true)}
								variant="default"
							>
								Edit Business Hours
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
};

export default BusinessHoursSettings;
