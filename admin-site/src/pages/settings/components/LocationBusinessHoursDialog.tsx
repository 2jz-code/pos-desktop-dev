import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Clock, Calendar, MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
	getBusinessHoursProfiles,
	createBusinessHoursProfile,
} from '@/services/api/businessHoursService';
import { WeeklyHours } from './business-hours/WeeklyHours';
import { SpecialHours } from './business-hours/SpecialHours';

interface LocationBusinessHoursDialogProps {
	location: any;
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
}

export function LocationBusinessHoursDialog({
	location,
	isOpen,
	setIsOpen,
}: LocationBusinessHoursDialogProps) {
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<'weekly' | 'special'>('weekly');
	const [profileId, setProfileId] = useState<number | null>(null);

	// Fetch business hours profile for this location
	const { data: profiles, isLoading } = useQuery({
		queryKey: ['businessHoursProfiles', location?.id],
		queryFn: () => getBusinessHoursProfiles(location?.id),
		enabled: !!location && isOpen,
	});

	// Get the profile for this location (should only be one with OneToOne relationship)
	const locationProfile = profiles?.[0];

	// Auto-create profile if it doesn't exist
	const createProfileMutation = useMutation({
		mutationFn: createBusinessHoursProfile,
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ['businessHoursProfiles'] });
			queryClient.invalidateQueries({ queryKey: ['storeLocations'] });
			setProfileId(data.id);
			toast.success('Business hours profile created for this location');
		},
		onError: (error: any) => {
			toast.error('Failed to create business hours profile', {
				description: error.response?.data?.detail || error.message,
			});
		},
	});

	// Set profile ID when loaded
	useEffect(() => {
		if (locationProfile) {
			setProfileId(locationProfile.id);
		}
	}, [locationProfile]);

	// Auto-create profile if location doesn't have one
	const handleCreateProfile = () => {
		if (!location) return;

		const profileData = {
			name: `${location.name} - Business Hours`,
			store_location: location.id,
			timezone: location.timezone || 'America/New_York',
			is_active: true,
			is_default: false, // Location-specific profiles are never default
		};

		createProfileMutation.mutate(profileData);
	};

	// Loading state
	if (isLoading) {
		return (
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<MapPin className="h-5 w-5" />
							Business Hours: {location?.name}
						</DialogTitle>
					</DialogHeader>
					<div className="flex items-center justify-center py-12">
						<div className="text-center">
							<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">
								Loading business hours...
							</p>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	// No profile exists - show create prompt
	if (!locationProfile && !createProfileMutation.isPending) {
		return (
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<MapPin className="h-5 w-5" />
							Business Hours: {location?.name}
						</DialogTitle>
						<DialogDescription>
							This location doesn't have business hours configured yet.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col items-center justify-center py-12">
						<Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold mb-2">No Business Hours Set</h3>
						<p className="text-muted-foreground mb-6 text-center max-w-md">
							Create a business hours profile for {location?.name} to configure
							weekly schedules, special hours, and holidays.
						</p>
						<Button onClick={handleCreateProfile}>
							<Clock className="h-4 w-4 mr-2" />
							Create Business Hours Profile
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	// Creating profile
	if (createProfileMutation.isPending) {
		return (
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<MapPin className="h-5 w-5" />
							Business Hours: {location?.name}
						</DialogTitle>
					</DialogHeader>
					<div className="flex items-center justify-center py-12">
						<div className="text-center">
							<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">
								Creating business hours profile...
							</p>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	// Main content - profile exists
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<MapPin className="h-5 w-5" />
						Business Hours: {location?.name}
					</DialogTitle>
					<DialogDescription>
						Manage weekly schedule and special hours for this location
					</DialogDescription>
				</DialogHeader>

				{/* Location Info Bar */}
				<div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="text-sm">
							<span className="text-muted-foreground">Profile:</span>{' '}
							<span className="font-medium">{locationProfile?.name}</span>
						</div>
						<div className="text-sm">
							<span className="text-muted-foreground">Timezone:</span>{' '}
							<span className="font-medium">{locationProfile?.timezone}</span>
						</div>
					</div>
					<div className="text-xs text-muted-foreground">
						{locationProfile?.is_active ? (
							<span className="text-green-600">Active</span>
						) : (
							<span className="text-amber-600">Inactive</span>
						)}
					</div>
				</div>

				{/* Tabs for Weekly Hours and Special Hours */}
				{profileId && (
					<Tabs
						value={activeTab}
						onValueChange={(value) => setActiveTab(value as 'weekly' | 'special')}
					>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="weekly" className="flex items-center gap-2">
								<Clock className="h-4 w-4" />
								Weekly Hours
							</TabsTrigger>
							<TabsTrigger value="special" className="flex items-center gap-2">
								<Calendar className="h-4 w-4" />
								Special Hours
							</TabsTrigger>
						</TabsList>

						<TabsContent value="weekly" className="mt-6">
							<WeeklyHours profileId={profileId} />
						</TabsContent>

						<TabsContent value="special" className="mt-6">
							<SpecialHours profileId={profileId} />
						</TabsContent>
					</Tabs>
				)}

				{/* Close Button */}
				<div className="flex justify-end pt-4 border-t">
					<Button onClick={() => setIsOpen(false)}>Close</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
