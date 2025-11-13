import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
	createStoreLocation,
	updateStoreLocation,
} from "@/services/api/settingsService";
import inventoryService from "@/services/api/inventoryService";
import { getTerminalRegistrationsByLocation } from "@/services/api/terminalService";
import { getGlobalSettings, getStoreLocation } from "@/services/api/settingsService";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatPhoneNumber, isValidPhoneNumber } from "@ajeen/ui";
import { MapPin, Bell } from "lucide-react";

// Timezone options (matching backend TimezoneChoices)
const TIMEZONE_OPTIONS = [
	{ value: "UTC", label: "UTC (Coordinated Universal Time)" },
	{ value: "America/New_York", label: "Eastern Time (US & Canada)" },
	{ value: "America/Chicago", label: "Central Time (US & Canada)" },
	{ value: "America/Denver", label: "Mountain Time (US & Canada)" },
	{ value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
	{ value: "America/Anchorage", label: "Alaska Time (US)" },
	{ value: "Pacific/Honolulu", label: "Hawaii Time (US)" },
	{ value: "America/Halifax", label: "Atlantic Time (Canada)" },
	{ value: "America/St_Johns", label: "Newfoundland Time (Canada)" },
	{ value: "Europe/London", label: "Greenwich Mean Time (UK)" },
	{ value: "Europe/Paris", label: "Central European Time" },
	{ value: "Europe/Berlin", label: "Central European Time (Germany)" },
	{ value: "Australia/Sydney", label: "Australian Eastern Time" },
	{ value: "Asia/Tokyo", label: "Japan Standard Time" },
	{ value: "Asia/Shanghai", label: "China Standard Time" },
];

const formSchema = z.object({
	// Basic Information
	name: z.string().min(2, "Location name must be at least 2 characters."),
	phone: z
		.string()
		.optional()
		.refine((phone) => {
			return !phone || isValidPhoneNumber(phone);
		}, "Please enter a valid phone number"),
	email: z
		.string()
		.email("Please enter a valid email.")
		.optional()
		.or(z.literal("")),

	// Structured Address (Phase 5)
	address_line1: z.string().optional(),
	address_line2: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	postal_code: z.string().optional(),
	country: z.string().max(2).optional().default("US"),

	// Location Settings
	timezone: z.string().optional(),
	tax_rate: z
		.string()
		.optional()
		.refine((val) => {
			if (!val) return true;
			const num = parseFloat(val);
			return !isNaN(num) && num >= 0 && num <= 1;
		}, "Tax rate must be between 0 and 1 (e.g., 0.08 for 8%)"),

	// Web Order Configuration
	accepts_web_orders: z.boolean().optional().default(true),
	web_order_lead_time_minutes: z
		.number()
		.int()
		.min(0)
		.optional()
		.default(30),

	// Receipt Customization (optional)
	receipt_header: z.string().optional(),
	receipt_footer: z.string().optional(),

	// Inventory Defaults (Phase 5)
	low_stock_threshold: z
		.number()
		.int()
		.min(0)
		.optional()
		.default(10),
	expiration_threshold: z
		.number()
		.int()
		.min(0)
		.optional()
		.default(7),
	default_inventory_location: z.string().optional(),

	// Google Integration (optional)
	google_place_id: z.string().optional(),
	latitude: z
		.string()
		.optional()
		.refine((val) => {
			if (!val) return true;
			const num = parseFloat(val);
			return !isNaN(num) && num >= -90 && num <= 90;
		}, "Latitude must be between -90 and 90"),
	longitude: z
		.string()
		.optional()
		.refine((val) => {
			if (!val) return true;
			const num = parseFloat(val);
			return !isNaN(num) && num >= -180 && num <= 180;
		}, "Longitude must be between -180 and 180"),

	// Web Order Notification Overrides (Phase 5) - nullable means inherit from tenant defaults
	enable_web_notifications: z.boolean().nullable().optional(),
	play_web_notification_sound: z.boolean().nullable().optional(),
	auto_print_web_receipt: z.boolean().nullable().optional(),
	auto_print_web_kitchen: z.boolean().nullable().optional(),
	web_notification_terminals: z.array(z.string()).optional(),
});

const StoreLocationFormDialog = ({ isOpen, setIsOpen, locationData }) => {
	const queryClient = useQueryClient();
	const isEditing = !!locationData;

	// Fetch inventory locations for dropdown
	const { data: locationsResponse } = useQuery({
		queryKey: ["inventoryLocations"],
		queryFn: inventoryService.getLocations,
		enabled: isOpen,
	});

	const inventoryLocations = Array.isArray(locationsResponse)
		? locationsResponse
		: locationsResponse?.results || locationsResponse?.data || [];

	// Fetch terminals for this location (only when editing)
	const { data: terminalsResponse } = useQuery({
		queryKey: ["terminalRegistrations", locationData?.id],
		queryFn: () => locationData?.id ? getTerminalRegistrationsByLocation(locationData.id) : Promise.resolve([]),
		enabled: isOpen && isEditing && !!locationData?.id,
	});

	const availableTerminals = Array.isArray(terminalsResponse)
		? terminalsResponse
		: terminalsResponse?.results || terminalsResponse?.data || [];

	// Fetch global settings to show tenant defaults
	const { data: globalSettings, isLoading: isLoadingGlobalSettings } = useQuery({
		queryKey: ["globalSettings"],
		queryFn: getGlobalSettings,
		enabled: isOpen,
	});

	// Fetch detailed location data when editing (to get raw override fields)
	const { data: detailedLocationData } = useQuery({
		queryKey: ["storeLocation", locationData?.id],
		queryFn: () => getStoreLocation(locationData.id),
		enabled: isOpen && isEditing && !!locationData?.id,
	});

	// Use detailed data if available, otherwise fall back to locationData
	const formLocationData = detailedLocationData || locationData;

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			phone: "",
			email: "",
			address_line1: "",
			address_line2: "",
			city: "",
			state: "",
			postal_code: "",
			country: "US",
			timezone: "America/New_York",
			tax_rate: "",
			accepts_web_orders: true,
			web_order_lead_time_minutes: 30,
			receipt_header: "",
			receipt_footer: "",
			low_stock_threshold: 10,
			expiration_threshold: 7,
			default_inventory_location: "none",
			google_place_id: "",
			latitude: "",
			longitude: "",
			enable_web_notifications: null,
			play_web_notification_sound: null,
			auto_print_web_receipt: null,
			auto_print_web_kitchen: null,
			web_notification_terminals: [],
		},
	});

	useEffect(() => {
		if (formLocationData) {
			// Convert numeric fields to strings for form display
			const overrides = formLocationData.web_order_settings?.overrides || {};

			const formattedData = {
				...formLocationData,
				tax_rate: formLocationData.tax_rate
					? formLocationData.tax_rate.toString()
					: "",
				latitude: formLocationData.latitude
					? formLocationData.latitude.toString()
					: "",
				longitude: formLocationData.longitude
					? formLocationData.longitude.toString()
					: "",
				default_inventory_location: formLocationData.default_inventory_location
					? formLocationData.default_inventory_location.toString()
					: "none",
				// Use override values from web_order_settings.overrides
				enable_web_notifications: overrides.enable_web_notifications,
				play_web_notification_sound: overrides.play_web_notification_sound,
				auto_print_web_receipt: overrides.auto_print_web_receipt,
				auto_print_web_kitchen: overrides.auto_print_web_kitchen,
				web_notification_terminals: overrides.web_notification_terminals || [],
			};
			form.reset(formattedData);
		} else {
			form.reset({
				name: "",
				phone: "",
				email: "",
				address_line1: "",
				address_line2: "",
				city: "",
				state: "",
				postal_code: "",
				country: "US",
				timezone: "America/New_York",
				tax_rate: "",
				accepts_web_orders: true,
				web_order_lead_time_minutes: 30,
				receipt_header: "",
				receipt_footer: "",
				low_stock_threshold: 10,
				expiration_threshold: 7,
				default_inventory_location: "none",
				google_place_id: "",
				latitude: "",
				longitude: "",
				enable_web_notifications: null,
				play_web_notification_sound: null,
				auto_print_web_receipt: null,
				auto_print_web_kitchen: null,
				web_notification_terminals: [],
			});
		}
	}, [formLocationData, form]);

	const mutation = useMutation({
		mutationFn: isEditing
			? (data) => updateStoreLocation(locationData.id, data)
			: createStoreLocation,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["storeLocations"] });
			toast.success(
				`Location ${isEditing ? "updated" : "created"} successfully!`
			);
			setIsOpen(false);
		},
		onError: (error) => {
			toast.error(
				`Failed to ${isEditing ? "update" : "create"} location: ${
					error.message
				}`
			);
		},
	});

	const onSubmit = (values) => {
		// Convert string values back to numbers for API
		const apiData = {
			...values,
			tax_rate: values.tax_rate ? parseFloat(values.tax_rate) : null,
			latitude: values.latitude ? parseFloat(values.latitude) : null,
			longitude: values.longitude ? parseFloat(values.longitude) : null,
			default_inventory_location:
				values.default_inventory_location === "none"
					? null
					: values.default_inventory_location,
			// Wrap web order override settings in the new structure
			web_order_settings: {
				overrides: {
					enable_web_notifications: values.enable_web_notifications,
					play_web_notification_sound: values.play_web_notification_sound,
					auto_print_web_receipt: values.auto_print_web_receipt,
					auto_print_web_kitchen: values.auto_print_web_kitchen,
					web_notification_terminals: values.web_notification_terminals,
				}
			}
		};

		// Remove the top-level override fields since they're now nested
		delete apiData.enable_web_notifications;
		delete apiData.play_web_notification_sound;
		delete apiData.auto_print_web_receipt;
		delete apiData.auto_print_web_kitchen;
		delete apiData.web_notification_terminals;

		mutation.mutate(apiData);
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogContent className="sm:max-w-[700px] max-h-[90vh]">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Location" : "Add New Location"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Update the details for this location."
							: "Add a new store location with full Phase 5 settings."}
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className="space-y-4 py-4"
						>
							{/* Basic Information */}
							<div className="space-y-4">
								<h3 className="text-sm font-semibold text-foreground">
									Basic Information
								</h3>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Location Name *</FormLabel>
											<FormControl>
												<Input
													placeholder="e.g., Downtown Branch"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={form.control}
										name="phone"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Phone Number</FormLabel>
												<FormControl>
													<Input
														placeholder="(123) 456-7890"
														{...field}
														onChange={(e) => {
															const formatted = formatPhoneNumber(
																e.target.value
															);
															field.onChange(formatted);
														}}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="email"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Email Address</FormLabel>
												<FormControl>
													<Input
														placeholder="contact@downtown.com"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</div>

							{/* Structured Address (Phase 5) */}
							<Accordion type="single" collapsible className="w-full">
								<AccordionItem value="address">
									<AccordionTrigger className="text-sm font-semibold">
										Structured Address (Recommended)
									</AccordionTrigger>
									<AccordionContent className="space-y-4 pt-4">
										<FormField
											control={form.control}
											name="address_line1"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Street Address</FormLabel>
													<FormControl>
														<Input placeholder="123 Main St" {...field} />
													</FormControl>
													<FormDescription>
														Primary street address
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="address_line2"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Address Line 2</FormLabel>
													<FormControl>
														<Input
															placeholder="Suite 100"
															{...field}
														/>
													</FormControl>
													<FormDescription>
														Apartment, suite, unit, etc.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<div className="grid grid-cols-2 gap-4">
											<FormField
												control={form.control}
												name="city"
												render={({ field }) => (
													<FormItem>
														<FormLabel>City</FormLabel>
														<FormControl>
															<Input
																placeholder="New York"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="state"
												render={({ field }) => (
													<FormItem>
														<FormLabel>State/Province</FormLabel>
														<FormControl>
															<Input placeholder="NY" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>
										<div className="grid grid-cols-2 gap-4">
											<FormField
												control={form.control}
												name="postal_code"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Postal Code</FormLabel>
														<FormControl>
															<Input placeholder="10001" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="country"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Country Code</FormLabel>
														<FormControl>
															<Input
																placeholder="US"
																maxLength={2}
																{...field}
															/>
														</FormControl>
														<FormDescription>
															Two-letter code (e.g., US, CA)
														</FormDescription>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>
									</AccordionContent>
								</AccordionItem>

								{/* Location Settings */}
								<AccordionItem value="settings">
									<AccordionTrigger className="text-sm font-semibold">
										Location-Specific Settings
									</AccordionTrigger>
									<AccordionContent className="space-y-4 pt-4">
										<FormField
											control={form.control}
											name="timezone"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Timezone</FormLabel>
													<Select
														onValueChange={field.onChange}
														defaultValue={field.value}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder="Select timezone" />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															{TIMEZONE_OPTIONS.map((tz) => (
																<SelectItem key={tz.value} value={tz.value}>
																	{tz.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<FormDescription>
														Location-specific timezone (overrides global
														setting)
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="tax_rate"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Tax Rate</FormLabel>
													<FormControl>
														<Input
															placeholder="0.08"
															type="number"
															step="0.0001"
															min="0"
															max="1"
															{...field}
														/>
													</FormControl>
													<FormDescription>
														Location-specific tax rate (e.g., 0.08 for 8%).
														Leave empty to use global tax rate.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</AccordionContent>
								</AccordionItem>

								{/* Web Order Configuration */}
								<AccordionItem value="web-orders">
									<AccordionTrigger className="text-sm font-semibold">
										Web Order Configuration
									</AccordionTrigger>
									<AccordionContent className="space-y-4 pt-4">
										<FormField
											control={form.control}
											name="accepts_web_orders"
											render={({ field }) => (
												<FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
													<FormControl>
														<Checkbox
															checked={field.value}
															onCheckedChange={field.onChange}
														/>
													</FormControl>
													<div className="space-y-1 leading-none">
														<FormLabel>Accepts Web Orders</FormLabel>
														<FormDescription>
															Whether this location accepts online orders
															for pickup/delivery
														</FormDescription>
													</div>
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="web_order_lead_time_minutes"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Lead Time (minutes)</FormLabel>
													<FormControl>
														<Input
															type="number"
															min="0"
															{...field}
															onChange={(e) =>
																field.onChange(parseInt(e.target.value))
															}
														/>
													</FormControl>
													<FormDescription>
														Minimum lead time for web orders in minutes
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>

										{/* Terminal Selection Section */}
										{isEditing && availableTerminals.length > 0 && (
											<div className="border-t pt-4 mt-4">
												<FormField
													control={form.control}
													name="web_notification_terminals"
													render={({ field }) => (
														<FormItem>
															<FormLabel className="text-sm font-medium">Notification Terminals</FormLabel>
															<FormDescription className="text-xs mb-3">
																Select which terminals at this location should show web order notifications
															</FormDescription>
															<div className="space-y-2 rounded-lg border p-3 bg-muted/20">
																{availableTerminals.map((terminal) => (
																	<div key={terminal.device_id} className="flex items-center space-x-2">
																		<Checkbox
																			checked={field.value?.includes(terminal.device_id)}
																			onCheckedChange={(checked) => {
																				const current = field.value || [];
																				if (checked) {
																					field.onChange([...current, terminal.device_id]);
																				} else {
																					field.onChange(current.filter(id => id !== terminal.device_id));
																				}
																			}}
																		/>
																		<label className="text-sm font-normal cursor-pointer">
																			{terminal.nickname || terminal.device_id}
																		</label>
																	</div>
																))}
															</div>
															<FormMessage />
														</FormItem>
													)}
												/>
											</div>
										)}

										{/* Notification Overrides Section */}
										<div className="border-t pt-4 mt-4">
											<div className="flex items-center gap-2 mb-4">
												<Bell className="h-4 w-4 text-muted-foreground" />
												<h4 className="text-sm font-medium">Web Order Notifications</h4>
											</div>

											{/* Effective Settings Display (when editing) */}
											{isEditing && formLocationData?.web_order_settings && (
												<div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
													<h5 className="text-sm font-medium mb-3 text-blue-900 dark:text-blue-100">
														Effective Settings (Currently Active)
													</h5>
													<div className="grid grid-cols-2 gap-3 text-xs">
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">Enable Notifications:</span>
															<span className={`font-medium ${formLocationData.web_order_settings.enable_notifications ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
																{formLocationData.web_order_settings.enable_notifications ? 'Enabled' : 'Disabled'}
															</span>
														</div>
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">Play Sound:</span>
															<span className={`font-medium ${formLocationData.web_order_settings.play_notification_sound ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
																{formLocationData.web_order_settings.play_notification_sound ? 'Enabled' : 'Disabled'}
															</span>
														</div>
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">Auto-Print Receipt:</span>
															<span className={`font-medium ${formLocationData.web_order_settings.auto_print_receipt ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
																{formLocationData.web_order_settings.auto_print_receipt ? 'Enabled' : 'Disabled'}
															</span>
														</div>
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">Auto-Print Kitchen:</span>
															<span className={`font-medium ${formLocationData.web_order_settings.auto_print_kitchen ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
																{formLocationData.web_order_settings.auto_print_kitchen ? 'Enabled' : 'Disabled'}
															</span>
														</div>
													</div>
													<p className="text-xs text-muted-foreground mt-3">
														These are the actual settings in effect (including overrides and tenant defaults).
													</p>
												</div>
											)}

											<div className="bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground mb-4">
												<p>Override tenant-wide notification defaults for this location. Select "Use Default" to inherit global settings from Brand Info, or choose "Enabled"/"Disabled" to set location-specific behavior.</p>
											</div>

											<div className="space-y-3">
												<FormField
													control={form.control}
													name="enable_web_notifications"
													render={({ field }) => {
														const tenantDefault = globalSettings?.web_order_defaults?.enable_notifications ?? true;
														// Check for both null and undefined
														const effectiveValue = (field.value != null) ? field.value : tenantDefault;

														return (
															<FormItem>
																<FormLabel className="text-sm">
																	Enable Notifications
																	{field.value == null && (
																		<span className="ml-2 text-xs text-muted-foreground">
																			(Currently: {effectiveValue ? "Enabled" : "Disabled"})
																		</span>
																	)}
																</FormLabel>
																<Select
																	value={field.value === null ? "default" : field.value ? "enabled" : "disabled"}
																	onValueChange={(value) => {
																		if (value === "default") field.onChange(null);
																		else if (value === "enabled") field.onChange(true);
																		else field.onChange(false);
																	}}
																>
																	<FormControl>
																		<SelectTrigger>
																			<SelectValue placeholder="Select option" />
																		</SelectTrigger>
																	</FormControl>
																	<SelectContent>
																		<SelectItem value="default">
																			Use Tenant Default ({tenantDefault ? "Enabled" : "Disabled"})
																		</SelectItem>
																		<SelectItem value="enabled">Enabled</SelectItem>
																		<SelectItem value="disabled">Disabled</SelectItem>
																	</SelectContent>
																</Select>
																<FormDescription className="text-xs">
																	Show POS notifications for new web orders at this location
																</FormDescription>
																<FormMessage />
															</FormItem>
														);
													}}
												/>

												<FormField
													control={form.control}
													name="play_web_notification_sound"
													render={({ field }) => {
														const tenantDefault = globalSettings?.web_order_defaults?.play_notification_sound ?? true;
														// Check for both null and undefined
														const effectiveValue = (field.value != null) ? field.value : tenantDefault;
														return (
															<FormItem>
																<FormLabel className="text-sm">
																	Play Notification Sound
																	{field.value == null && (
																		<span className="ml-2 text-xs text-muted-foreground">
																			(Currently: {effectiveValue ? "Enabled" : "Disabled"})
																		</span>
																	)}
																</FormLabel>
																<Select
																	value={field.value === null ? "default" : field.value ? "enabled" : "disabled"}
																	onValueChange={(value) => {
																		if (value === "default") field.onChange(null);
																		else if (value === "enabled") field.onChange(true);
																		else field.onChange(false);
																	}}
																>
																	<FormControl>
																		<SelectTrigger>
																			<SelectValue placeholder="Select option" />
																		</SelectTrigger>
																	</FormControl>
																	<SelectContent>
																		<SelectItem value="default">
																			Use Tenant Default ({tenantDefault ? "Enabled" : "Disabled"})
																		</SelectItem>
																		<SelectItem value="enabled">Enabled</SelectItem>
																		<SelectItem value="disabled">Disabled</SelectItem>
																	</SelectContent>
																</Select>
																<FormDescription className="text-xs">
																	Play a sound when web orders arrive at this location
																</FormDescription>
																<FormMessage />
															</FormItem>
														);
													}}
												/>

												<FormField
													control={form.control}
													name="auto_print_web_receipt"
													render={({ field }) => {
														const tenantDefault = globalSettings?.web_order_defaults?.auto_print_receipt ?? true;
														// Check for both null and undefined
														const effectiveValue = (field.value != null) ? field.value : tenantDefault;
														return (
															<FormItem>
																<FormLabel className="text-sm">
																	Auto-Print Receipts
																	{field.value === null && (
																		<span className="ml-2 text-xs text-muted-foreground">
																			(Currently: {effectiveValue ? "Enabled" : "Disabled"})
																		</span>
																	)}
																</FormLabel>
																<Select
																	value={field.value === null ? "default" : field.value ? "enabled" : "disabled"}
																	onValueChange={(value) => {
																		if (value === "default") field.onChange(null);
																		else if (value === "enabled") field.onChange(true);
																		else field.onChange(false);
																	}}
																>
																	<FormControl>
																		<SelectTrigger>
																			<SelectValue placeholder="Select option" />
																		</SelectTrigger>
																	</FormControl>
																	<SelectContent>
																		<SelectItem value="default">
																			Use Tenant Default ({tenantDefault ? "Enabled" : "Disabled"})
																		</SelectItem>
																		<SelectItem value="enabled">Enabled</SelectItem>
																		<SelectItem value="disabled">Disabled</SelectItem>
																	</SelectContent>
																</Select>
																<FormDescription className="text-xs">
																	Automatically print customer receipts for web orders
																</FormDescription>
																<FormMessage />
															</FormItem>
														);
													}}
												/>

												<FormField
													control={form.control}
													name="auto_print_web_kitchen"
													render={({ field }) => {
														const tenantDefault = globalSettings?.web_order_defaults?.auto_print_kitchen ?? true;
														// Check for both null and undefined
														const effectiveValue = (field.value != null) ? field.value : tenantDefault;
														return (
															<FormItem>
																<FormLabel className="text-sm">
																	Auto-Print Kitchen Tickets
																	{field.value === null && (
																		<span className="ml-2 text-xs text-muted-foreground">
																			(Currently: {effectiveValue ? "Enabled" : "Disabled"})
																		</span>
																	)}
																</FormLabel>
																<Select
																	value={field.value === null ? "default" : field.value ? "enabled" : "disabled"}
																	onValueChange={(value) => {
																		if (value === "default") field.onChange(null);
																		else if (value === "enabled") field.onChange(true);
																		else field.onChange(false);
																	}}
																>
																	<FormControl>
																		<SelectTrigger>
																			<SelectValue placeholder="Select option" />
																		</SelectTrigger>
																	</FormControl>
																	<SelectContent>
																		<SelectItem value="default">
																			Use Tenant Default ({tenantDefault ? "Enabled" : "Disabled"})
																		</SelectItem>
																		<SelectItem value="enabled">Enabled</SelectItem>
																		<SelectItem value="disabled">Disabled</SelectItem>
																	</SelectContent>
																</Select>
																<FormDescription className="text-xs">
																	Automatically print kitchen tickets for web orders
																</FormDescription>
																<FormMessage />
															</FormItem>
														);
													}}
												/>
											</div>
										</div>
									</AccordionContent>
								</AccordionItem>

								{/* Receipt Customization */}
								<AccordionItem value="receipts">
									<AccordionTrigger className="text-sm font-semibold">
										Receipt Customization (Optional)
									</AccordionTrigger>
									<AccordionContent className="space-y-4 pt-4">
										<FormField
											control={form.control}
											name="receipt_header"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Receipt Header</FormLabel>
													<FormControl>
														<Textarea
															placeholder="Custom header text..."
															{...field}
														/>
													</FormControl>
													<FormDescription>
														Location-specific receipt header. If empty,
														uses global header.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="receipt_footer"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Receipt Footer</FormLabel>
													<FormControl>
														<Textarea
															placeholder="Custom footer text..."
															{...field}
														/>
													</FormControl>
													<FormDescription>
														Location-specific receipt footer. If empty,
														uses global footer.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</AccordionContent>
								</AccordionItem>

								{/* Inventory Defaults */}
								<AccordionItem value="inventory">
									<AccordionTrigger className="text-sm font-semibold">
										Inventory Defaults (Phase 5)
									</AccordionTrigger>
									<AccordionContent className="space-y-4 pt-4">
										<div className="bg-muted/50 rounded-lg p-4 mb-4">
											<p className="text-sm text-muted-foreground">
												These defaults apply to all inventory at this location. Individual storage areas and stock items can override these values.
											</p>
										</div>
										<FormField
											control={form.control}
											name="low_stock_threshold"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Low Stock Threshold</FormLabel>
													<FormControl>
														<Input
															type="number"
															min="0"
															{...field}
															onChange={(e) =>
																field.onChange(parseInt(e.target.value))
															}
														/>
													</FormControl>
													<FormDescription>
														Default quantity threshold for low stock warnings at this location
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="expiration_threshold"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Expiration Warning (days)</FormLabel>
													<FormControl>
														<Input
															type="number"
															min="0"
															{...field}
															onChange={(e) =>
																field.onChange(parseInt(e.target.value))
															}
														/>
													</FormControl>
													<FormDescription>
														Default days before expiration to warn about expiring stock at this location
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="default_inventory_location"
											render={({ field }) => (
												<FormItem>
													<FormLabel className="flex items-center gap-2">
														<MapPin className="h-4 w-4 text-blue-500" />
														Default Stock Location
													</FormLabel>
													<Select onValueChange={field.onChange} value={field.value}>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder="Select location" />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															<SelectItem value="none">None (Manual Selection)</SelectItem>
															{Array.isArray(inventoryLocations) && inventoryLocations.map((location) => (
																<SelectItem key={location.id} value={location.id.toString()}>
																	{location.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<FormDescription>
														Default inventory location for stock operations at this store
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</AccordionContent>
								</AccordionItem>

								{/* Google Integration */}
								<AccordionItem value="google">
									<AccordionTrigger className="text-sm font-semibold">
										Google Integration (Optional)
									</AccordionTrigger>
									<AccordionContent className="space-y-4 pt-4">
										<FormField
											control={form.control}
											name="google_place_id"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Google Place ID</FormLabel>
													<FormControl>
														<Input
															placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
															{...field}
														/>
													</FormControl>
													<FormDescription>
														For Google reviews, maps, and directions
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<div className="grid grid-cols-2 gap-4">
											<FormField
												control={form.control}
												name="latitude"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Latitude</FormLabel>
														<FormControl>
															<Input
																placeholder="40.7128"
																type="number"
																step="any"
																{...field}
															/>
														</FormControl>
														<FormDescription>
															Latitude coordinate (-90 to 90)
														</FormDescription>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="longitude"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Longitude</FormLabel>
														<FormControl>
															<Input
																placeholder="-74.0060"
																type="number"
																step="any"
																{...field}
															/>
														</FormControl>
														<FormDescription>
															Longitude coordinate (-180 to 180)
														</FormDescription>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>
									</AccordionContent>
								</AccordionItem>
							</Accordion>

							<DialogFooter className="pt-4">
								<Button
									type="button"
									variant="ghost"
									onClick={() => setIsOpen(false)}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={mutation.isPending}>
									{mutation.isPending ? "Saving..." : "Save Location"}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
};

export default StoreLocationFormDialog;
