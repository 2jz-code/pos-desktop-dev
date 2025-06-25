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
import { usePosStore } from "@/domains/pos/store/posStore";

const LocationManagementDialog = ({
	isOpen,
	onClose,
	location,
	mode = "create",
}) => {
	const [formData, setFormData] = useState({
		name: "",
		description: "",
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	// Get actions from the store
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

		setLoading(true);
		setError("");

		try {
			let result;
			if (mode === "edit" && location) {
				result = await updateLocation(location.id, formData);
			} else {
				result = await createLocation(formData);
			}

			if (result.success) {
				handleClose();
			} else {
				setError(result.error || `Failed to ${mode} location`);
			}
		} catch (error) {
			console.error(`Failed to ${mode} location:`, error);
			setError(`Failed to ${mode} location`);
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
		onClose();
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={handleClose}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<MapPin className="h-5 w-5" />
						{mode === "edit" ? "Edit Location" : "Create Location"}
					</DialogTitle>
					<DialogDescription>
						{mode === "edit"
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
								? mode === "edit"
									? "Updating..."
									: "Creating..."
								: mode === "edit"
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
