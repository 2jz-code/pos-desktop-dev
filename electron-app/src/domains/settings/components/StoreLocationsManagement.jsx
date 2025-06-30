import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getStoreLocations,
	deleteStoreLocation,
} from "../services/settingsService";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { PlusCircle, Edit, Trash2, Home, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import StoreLocationFormDialog from "./StoreLocationFormDialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";

export function StoreLocationsManagement() {
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
		useState(false);
	const [selectedLocation, setSelectedLocation] = useState(null);
	const [locationToDelete, setLocationToDelete] = useState(null);

	const queryClient = useQueryClient();

	const {
		data: locations,
		isLoading,
		isError,
		error,
	} = useQuery({
		queryKey: ["storeLocations"],
		queryFn: getStoreLocations,
	});

	const deleteMutation = useMutation({
		mutationFn: deleteStoreLocation,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["storeLocations"] });
			toast.success("Location deleted successfully!");
		},
		onError: (error) => {
			toast.error(
				`Failed to delete location: ${
					error.response?.data?.detail || error.message
				}`
			);
		},
		onSettled: () => {
			setLocationToDelete(null);
			setIsConfirmDeleteDialogOpen(false);
		},
	});

	const handleAddNew = () => {
		setSelectedLocation(null);
		setIsFormOpen(true);
	};

	const handleEdit = (location) => {
		setSelectedLocation(location);
		setIsFormOpen(true);
	};

	const handleDeleteClick = (location) => {
		setLocationToDelete(location);
		setIsConfirmDeleteDialogOpen(true);
	};

	const handleConfirmDelete = () => {
		if (locationToDelete) {
			deleteMutation.mutate(locationToDelete.id);
		}
	};

	if (isLoading) return <div>Loading locations...</div>;
	if (isError) return <div>Error fetching locations: {error.message}</div>;

	return (
		<div>
			<div className="flex justify-end mb-4">
				<Button onClick={handleAddNew}>
					<PlusCircle className="mr-2 h-4 w-4" />
					Add New Location
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{locations?.map((location) => (
					<Card key={location.id}>
						<CardHeader>
							<CardTitle className="flex justify-between items-center">
								{location.name}
							</CardTitle>
							<CardDescription>
								{location.is_default ? "(Default Inventory Location)" : ""}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2 text-sm text-muted-foreground">
							{location.address && (
								<div className="flex items-start">
									<Home className="h-4 w-4 mr-2 mt-1 flex-shrink-0" />
									<span>{location.address}</span>
								</div>
							)}
							{location.phone && (
								<div className="flex items-center">
									<Phone className="h-4 w-4 mr-2" />
									<span>{location.phone}</span>
								</div>
							)}
							{location.email && (
								<div className="flex items-center">
									<Mail className="h-4 w-4 mr-2" />
									<span>{location.email}</span>
								</div>
							)}
						</CardContent>
						<div className="p-4 border-t flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleEdit(location)}
							>
								<Edit className="mr-2 h-4 w-4" /> Edit
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onClick={() => handleDeleteClick(location)}
							>
								<Trash2 className="mr-2 h-4 w-4" /> Delete
							</Button>
						</div>
					</Card>
				))}
			</div>

			<StoreLocationFormDialog
				isOpen={isFormOpen}
				setIsOpen={setIsFormOpen}
				locationData={selectedLocation}
			/>

			<AlertDialog
				open={isConfirmDeleteDialogOpen}
				onOpenChange={setIsConfirmDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete the
							<span className="font-bold"> {locationToDelete?.name} </span>
							location. Any terminals assigned here will need to be reassigned.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmDelete}
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? "Deleting..." : "Continue"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
