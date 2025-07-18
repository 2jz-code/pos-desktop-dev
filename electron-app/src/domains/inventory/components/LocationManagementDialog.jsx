import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { usePosStore } from "@/domains/pos/store/posStore";

const LocationManagementDialog = ({
	isOpen,
	onClose,
	onOpenChange,
	location = null,
	mode = "create",
	onSuccess,
}) => {
	const [formData, setFormData] = useState({
		name: "",
		description: "",
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	// Get actions from the inventory store
	const { createLocation, updateLocation } = usePosStore((state) => ({
		createLocation: state.createLocation,
		updateLocation: state.updateLocation,
	}));

	useEffect(() => {
		if (isOpen) {
			if (location && mode === "edit") {
				setFormData({
					name: location.name || "",
					description: location.description || "",
				});
			} else {
				setFormData({
					name: "",
					description: "",
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

		setLoading(true);
		setError("");

		try {
			const dataToSubmit = {
				name: formData.name.trim(),
				description: formData.description.trim(),
			};

			let result;
			if (mode === "edit" && location) {
				result = await updateLocation(location.id, dataToSubmit);
			} else {
				result = await createLocation(dataToSubmit);
			}

			if (result.success) {
				toast.success(
					mode === "edit" ? "Location Updated" : "Location Created",
					{
						description: `Location "${dataToSubmit.name}" ${
							mode === "edit" ? "updated" : "created"
						} successfully`,
					}
				);

				if (onSuccess) {
					onSuccess();
				}

				handleClose();
			} else {
				const errorMessage = result.error || `Failed to ${mode} location`;
				setError(errorMessage);
				toast.error(
					`Location ${mode === "edit" ? "Update" : "Creation"} Failed`,
					{
						description: errorMessage,
					}
				);
			}
		} catch (error) {
			console.error(`Failed to ${mode} location:`, error);
			const errorMessage = `Failed to ${mode} location`;
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
		});
		setError("");
		if (onOpenChange) {
			onOpenChange(false);
		} else if (onClose) {
			onClose();
		}
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