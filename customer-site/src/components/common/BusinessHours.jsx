import React from "react";
import { 
	useBusinessHoursStatus, 
	useTodayHours, 
	useWeeklySchedule,
	formatTime,
	formatBusinessHoursRange,
	getDayName,
	getShortDayName
} from "@/hooks/useSettings";

// Individual time slot component
const TimeSlot = ({ slot }) => {
	if (!slot) return null;
	
	// Handle both API formats: opening_time/closing_time and open_time/close_time
	const openTime = slot.opening_time || slot.open_time;
	const closeTime = slot.closing_time || slot.close_time;
	
	return (
		<span className="text-primary-green font-medium">
			{formatBusinessHoursRange(openTime, closeTime)}
		</span>
	);
};

// Multiple time slots for a day
const DaySlots = ({ slots }) => {
	if (!slots || slots.length === 0) {
		return (
			<span className="text-accent-subtle-gray font-medium">Closed</span>
		);
	}
	
	return (
		<div className="flex flex-col gap-1">
			{slots.map((slot, index) => (
				<TimeSlot key={index} slot={slot} />
			))}
		</div>
	);
};

// Status indicator component
const StatusIndicator = ({ isOpen, isLoading }) => {
	if (isLoading) {
		return (
			<div className="flex items-center">
				<div className="w-2 h-2 bg-accent-subtle-gray rounded-full mr-2 animate-pulse"></div>
				<span className="text-sm text-accent-subtle-gray">Loading...</span>
			</div>
		);
	}
	
	return (
		<div className="flex items-center">
			<div 
				className={`w-2 h-2 rounded-full mr-2 ${
					isOpen ? 'bg-green-500' : 'bg-red-500'
				}`}
			></div>
			<span className={`text-sm font-medium ${
				isOpen ? 'text-green-500' : 'text-red-500'
			}`}>
				{isOpen ? 'Open' : 'Closed'}
			</span>
		</div>
	);
};

// Compact view - just today's hours
export const BusinessHoursCompact = () => {
	const { data: status, isLoading: statusLoading } = useBusinessHoursStatus();
	const { data: todayHours, isLoading: todayLoading } = useTodayHours();
	
	const isLoading = statusLoading || todayLoading;
	
	if (isLoading) {
		return (
			<div className="flex items-center justify-between">
				<span className="text-primary-beige">Today</span>
				<div className="w-20 h-4 bg-accent-subtle-gray/30 rounded animate-pulse"></div>
			</div>
		);
	}
	
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center">
				<span className="text-primary-beige mr-3">Today</span>
				<StatusIndicator isOpen={status?.is_open} isLoading={isLoading} />
			</div>
			<DaySlots slots={todayHours?.time_slots || []} />
		</div>
	);
};

// Detailed view - full weekly schedule
export const BusinessHoursDetailed = ({ textColor = "text-primary-beige" }) => {
	const { data: schedule, isLoading } = useWeeklySchedule();
	
	if (isLoading) {
		return (
			<div className="space-y-2">
				{[...Array(7)].map((_, index) => (
					<div key={index} className="flex justify-between items-center">
						<div className="w-20 h-4 bg-accent-subtle-gray/30 rounded animate-pulse"></div>
						<div className="w-32 h-4 bg-accent-subtle-gray/30 rounded animate-pulse"></div>
					</div>
				))}
			</div>
		);
	}
	
	// Handle the actual API response format
	if (!schedule?.schedule) {
		return (
			<div className="text-center text-accent-subtle-gray py-4">
				No schedule available
			</div>
		);
	}
	
	// Convert schedule to day data with smart grouping
	const scheduleEntries = Object.entries(schedule.schedule).sort();
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	
	// Convert to array with day names and normalize hours format
	const daySchedules = scheduleEntries.map(([date, dayData]) => {
		const [year, month, day] = date.split('-').map(Number);
		const dateObj = new Date(year, month - 1, day);
		const dayName = dayNames[dateObj.getDay()];
		const dayIndex = dateObj.getDay();
		
		// Normalize hours to a comparable string
		let hoursString = '';
		if (dayData.is_closed || !dayData.slots || dayData.slots.length === 0) {
			hoursString = 'CLOSED';
		} else {
			hoursString = dayData.slots.map(slot => 
				`${slot.opening_time || slot.open_time}-${slot.closing_time || slot.close_time}`
			).join(',');
		}
		
		return {
			date,
			dayName,
			dayIndex,
			dayData,
			hoursString,
			slots: dayData.is_closed ? [] : dayData.slots || []
		};
	});
	
	// Group consecutive days with same hours
	const groupedDays = [];
	let currentGroup = null;
	
	daySchedules.forEach((daySchedule) => {
		if (!currentGroup || currentGroup.hoursString !== daySchedule.hoursString) {
			// Start new group
			currentGroup = {
				hoursString: daySchedule.hoursString,
				slots: daySchedule.slots,
				days: [daySchedule.dayName],
				startDay: daySchedule.dayName,
				endDay: daySchedule.dayName
			};
			groupedDays.push(currentGroup);
		} else {
			// Add to current group
			currentGroup.days.push(daySchedule.dayName);
			currentGroup.endDay = daySchedule.dayName;
		}
	});
	
	return (
		<div className="space-y-2">
			{groupedDays.map((group, index) => {
				// Format day range
				let dayRange;
				if (group.days.length === 1) {
					dayRange = group.startDay;
				} else if (group.days.length === 2) {
					dayRange = `${group.startDay} & ${group.endDay}`;
				} else {
					dayRange = `${group.startDay} - ${group.endDay}`;
				}
				
				return (
					<div key={index} className="flex justify-between items-center">
						<span className={textColor}>
							{dayRange}
						</span>
						<DaySlots slots={group.slots} />
					</div>
				);
			})}
		</div>
	);
};

// Status-only view - just open/closed with next change
export const BusinessHoursStatusOnly = () => {
	const { data: status, isLoading } = useBusinessHoursStatus();
	
	if (isLoading) {
		return (
			<div className="flex items-center">
				<StatusIndicator isOpen={false} isLoading={true} />
			</div>
		);
	}
	
	const nextTime = status?.is_open ? status?.next_closing_time : status?.next_opening_time;
	const nextLabel = status?.is_open ? "Closes" : "Opens";
	
	return (
		<div className="flex flex-col">
			<StatusIndicator isOpen={status?.is_open} isLoading={false} />
			{nextTime && (
				<span className="text-xs text-accent-subtle-gray mt-1">
					{nextLabel} at {formatTime(nextTime)}
				</span>
			)}
		</div>
	);
};

// Main BusinessHours component with different display modes
const BusinessHours = ({ 
	mode = "detailed", // "compact", "detailed", "status-only"
	className = "",
	showStatus = false,
	textColor = "text-primary-beige" // Default for footer, can be overridden for navbar
}) => {
	const baseClassName = `business-hours ${className}`;
	
	if (mode === "compact") {
		return (
			<div className={baseClassName}>
				{showStatus && <BusinessHoursStatusOnly />}
				<BusinessHoursCompact />
			</div>
		);
	}
	
	if (mode === "status-only") {
		return (
			<div className={baseClassName}>
				<BusinessHoursStatusOnly />
			</div>
		);
	}
	
	// Default: detailed mode
	return (
		<div className={baseClassName}>
			{showStatus && (
				<div className="mb-4 pb-3 border-b border-accent-subtle-gray/30">
					<BusinessHoursStatusOnly />
				</div>
			)}
			<BusinessHoursDetailed textColor={textColor} />
		</div>
	);
};

export default BusinessHours;