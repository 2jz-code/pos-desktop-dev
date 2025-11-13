import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoreLocations, deleteStoreLocation } from "@/services/api/settingsService";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Edit, Trash2, Home, Phone, Mail, MapPin, Globe, Clock, DollarSign, ShoppingCart } from "lucide-react";
import { formatPhoneNumber } from "@ajeen/ui";
import { toast } from "sonner";
import StoreLocationFormDialog from "./StoreLocationFormDialog";
import { LocationBusinessHoursDialog } from "./LocationBusinessHoursDialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function StoreLocationsManagement() {
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] =
		useState(false);
	const [selectedLocation, setSelectedLocation] = useState(null);
	const [locationToDelete, setLocationToDelete] = useState(null);
	const [isBusinessHoursOpen, setIsBusinessHoursOpen] = useState(false);
	const [locationForHours, setLocationForHours] = useState(null);

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

	const handleManageHours = (location) => {
		setLocationForHours(location);
		setIsBusinessHoursOpen(true);
	};

	// Format structured address
	const formatAddress = (location) => {
		if (!location.address_line1) {
			return "No address provided";
		}

		const parts = [location.address_line1];
		if (location.address_line2) parts.push(location.address_line2);
		const cityLine = [location.city, location.state, location.postal_code]
			.filter(Boolean)
			.join(", ");
		if (cityLine) parts.push(cityLine);
		if (location.country && location.country !== "US") parts.push(location.country);
		return parts.join("\n");
	};

	if (isLoading) return <div>Loading locations...</div>;
	if (isError) return <div>Error fetching locations: {error.message}</div>;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<MapPin className="h-5 w-5" />
					Store Locations
				</CardTitle>
				<CardDescription>
					Manage your physical store locations with Phase 5 multi-location settings
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex justify-end mb-4">
					<Button onClick={handleAddNew}>
						<PlusCircle className="mr-2 h-4 w-4" />
						Add New Location
					</Button>
				</div>

				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{locations?.map((location) => (
					<Card key={location.id} className="border-border">
						<CardHeader className="pb-3">
							<div className="flex justify-between items-start">
								<CardTitle className="text-lg">{location.name}</CardTitle>
							</div>
							{location.slug && (
								<CardDescription className="text-xs font-mono">
									/{location.slug}
								</CardDescription>
							)}
						</CardHeader>

						<CardContent className="space-y-3 text-sm">
							{/* Address */}
							{formatAddress(location) && (
								<div className="flex items-start gap-2">
									<Home className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
									<span className="text-muted-foreground whitespace-pre-line">
										{formatAddress(location)}
									</span>
								</div>
							)}

							{/* Contact Info */}
							<div className="space-y-2">
								{location.phone && (
									<div className="flex items-center gap-2">
										<Phone className="h-4 w-4 text-muted-foreground" />
										<span className="text-muted-foreground">
											{formatPhoneNumber(location.phone)}
										</span>
									</div>
								)}
								{location.email && (
									<div className="flex items-center gap-2">
										<Mail className="h-4 w-4 text-muted-foreground" />
										<span className="text-muted-foreground">
											{location.email}
										</span>
									</div>
								)}
							</div>

							<Separator />

							{/* Location Settings */}
							<div className="space-y-2 text-xs">
								{location.timezone && (
									<div className="flex items-center gap-2">
										<Clock className="h-3 w-3 text-muted-foreground" />
										<span className="text-muted-foreground">
											{location.timezone}
										</span>
									</div>
								)}
								{location.tax_rate !== null && location.tax_rate !== undefined && (
									<div className="flex items-center gap-2">
										<DollarSign className="h-3 w-3 text-muted-foreground" />
										<span className="text-muted-foreground">
											Tax: {(location.tax_rate * 100).toFixed(2)}%
										</span>
									</div>
								)}
								{location.accepts_web_orders !== undefined && (
									<div className="flex items-center gap-2">
										<ShoppingCart className="h-3 w-3 text-muted-foreground" />
										<span className="text-muted-foreground">
											{location.accepts_web_orders ? (
												<Badge variant="success" className="text-xs">
													Accepts Web Orders
												</Badge>
											) : (
												<Badge variant="secondary" className="text-xs">
													No Web Orders
												</Badge>
											)}
										</span>
									</div>
								)}
								{location.google_place_id && (
									<div className="flex items-center gap-2">
										<Globe className="h-3 w-3 text-muted-foreground" />
										<span className="text-muted-foreground text-xs">
											Google integrated
										</span>
									</div>
								)}
								{/* Business Hours Indicator */}
								{location.business_hours ? (
									<div className="flex items-center gap-2">
										<Clock className="h-3 w-3 text-muted-foreground" />
										<Badge variant={location.business_hours.is_active ? "default" : "secondary"} className="text-xs">
											{location.business_hours.is_active ? "Hours Configured" : "Hours Inactive"}
										</Badge>
									</div>
								) : (
									<div className="flex items-center gap-2">
										<Clock className="h-3 w-3 text-muted-foreground" />
										<span className="text-muted-foreground text-xs">
											No hours set
										</span>
									</div>
								)}
							</div>
						</CardContent>

						<div className="p-4 border-t flex justify-end gap-2 flex-wrap">
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleManageHours(location)}
							>
								<Clock className="mr-1 h-3 w-3" /> Manage Hours
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleEdit(location)}
							>
								<Edit className="mr-1 h-3 w-3" /> Edit
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onClick={() => handleDeleteClick(location)}
							>
								<Trash2 className="mr-1 h-3 w-3" /> Delete
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

				{/* Business Hours Dialog */}
				{locationForHours && (
					<LocationBusinessHoursDialog
						location={locationForHours}
						isOpen={isBusinessHoursOpen}
						setIsOpen={setIsBusinessHoursOpen}
					/>
				)}
			</CardContent>
		</Card>
	);
}
