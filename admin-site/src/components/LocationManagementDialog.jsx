import React, { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Alert, AlertDescription } from "./ui/alert";
import { MapPin, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import inventoryService from "../services/api/inventoryService";
import { useQuery } from "@tanstack/react-query";
import { getGlobalSettings } from "../services/api/settingsService";

const LocationManagementDialog = ({
	isOpen,
	onOpenChange,
	location = null,
	mode = "create",
	onSuccess,
}) => {
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		low_stock_threshold: "",
		expiration_threshold: "",
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (isOpen) {
			if (location && mode === "edit") {
				setFormData({
					name: location.name || "",
					description: location.description || "",
					low_stock_threshold: location.low_stock_threshold || "",
					expiration_threshold: location.expiration_threshold || "",
				});
			} else {
				setFormData({
					name: "",
					description: "",
					low_stock_threshold: "",
					expiration_threshold: "",
				});
			}
			setError("");
		}
	}, [isOpen, location, mode]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!formData.name.trim()) {
			setError("Location name is required");
			return;
		}

		if (formData.name.length > 100) {
			setError("Location name must be 100 characters or less");
			return;
		}

		if (formData.description.length > 500) {
			setError("Description must be 500 characters or less");
			return;
		}

		// Validate threshold fields if provided
		if (formData.low_stock_threshold && (isNaN(formData.low_stock_threshold) || parseFloat(formData.low_stock_threshold) < 0)) {
			setError("Low stock threshold must be a positive number");
			return;
		}

		if (formData.expiration_threshold && (isNaN(formData.expiration_threshold) || parseInt(formData.expiration_threshold) < 1 || parseInt(formData.expiration_threshold) > 365)) {
			setError("Expiration threshold must be between 1 and 365 days");
			return;
		}

		setLoading(true);
		setError("");

		try {
			const dataToSubmit = {
				name: formData.name.trim(),
				description: formData.description.trim(),
				...(formData.low_stock_threshold && { low_stock_threshold: parseFloat(formData.low_stock_threshold) }),
				...(formData.expiration_threshold && { expiration_threshold: parseInt(formData.expiration_threshold) }),
			};

			if (mode === "edit" && location) {
				await inventoryService.updateLocation(location.id, dataToSubmit);
				toast.success("Location Updated", {
					description: `Location "${dataToSubmit.name}" updated successfully`,
				});
			} else {
				await inventoryService.createLocation(dataToSubmit);
				toast.success("Location Created", {
					description: `Location "${dataToSubmit.name}" created successfully`,
				});
			}

			if (onSuccess) {
				onSuccess();
			}

			handleClose();
		} catch (error) {
			console.error(`Failed to ${mode} location:`, error);
			const errorMessage =
				error.response?.data?.message ||
				error.response?.data?.name?.[0] ||
				`Failed to ${mode} location`;
			setError(errorMessage);
			toast.error(
				`Location ${mode === "edit" ? "Update" : "Creation"} Failed`,
				{
					description: errorMessage,
				}
			);
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		setFormData({
			name: "",
			description: "",
			low_stock_threshold: "",
			expiration_threshold: "",
		});
		setError("");
		onOpenChange(false);
	};

	const isEditing = mode === "edit";

	return (
		<Dialog
			open={isOpen}
			onOpenChange={handleClose}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<MapPin className="h-5 w-5" />
						{isEditing ? "Edit Location" : "Create Location"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Update the location details"
							: "Add a new inventory storage location"}
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={handleSubmit}
					className="space-y-4"
				>
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="space-y-2">
						<Label htmlFor="name">Location Name *</Label>
						<Input
							id="name"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							placeholder="e.g., Main Warehouse, Kitchen Storage"
							maxLength={100}
						/>
						<p className="text-xs text-muted-foreground">
							{formData.name.length}/100 characters
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description (Optional)</Label>
						<Textarea
							id="description"
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							placeholder="Brief description of this location"
							rows={3}
							maxLength={500}
						/>
						<p className="text-xs text-muted-foreground">
							{formData.description.length}/500 characters
						</p>
					</div>

					<div className="space-y-4 border-t pt-4">
						<h4 className="text-sm font-medium">Threshold Settings (Optional)</h4>
						<p className="text-xs text-muted-foreground">
							Set location-specific thresholds. Leave blank to use global defaults.
						</p>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="low_stock_threshold" className="flex items-center gap-2">
									<AlertTriangle className="h-4 w-4 text-warning" />
									Low Stock Threshold
								</Label>
								<Input
									id="low_stock_threshold"
									type="number"
									step="0.01"
									min="0"
									value={formData.low_stock_threshold}
									onChange={(e) =>
										setFormData({ ...formData, low_stock_threshold: e.target.value })
									}
									placeholder="Use global default"
								/>
								<p className="text-xs text-muted-foreground">
									Items below this quantity will be marked as low stock
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="expiration_threshold" className="flex items-center gap-2">
									<Clock className="h-4 w-4 text-warning" />
									Expiration Warning (Days)
								</Label>
								<Input
									id="expiration_threshold"
									type="number"
									min="1"
									max="365"
									value={formData.expiration_threshold}
									onChange={(e) =>
										setFormData({ ...formData, expiration_threshold: e.target.value })
									}
									placeholder="Use global default"
								/>
								<p className="text-xs text-muted-foreground">
									Warn this many days before expiration
								</p>
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={handleClose}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={loading}
						>
							{loading
								? isEditing
									? "Updating..."
									: "Creating..."
								: isEditing
								? "Update Location"
								: "Create Location"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};

export default LocationManagementDialog;
