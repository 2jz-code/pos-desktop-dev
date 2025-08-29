import apiClient from "./client";

/**
 * Business Hours Service
 * Handles all business hours API interactions using the new comprehensive API
 */

// === Business Hours Status and Info ===

export const getBusinessHoursStatus = async () => {
	const response = await apiClient.get("business-hours/status/");
	return response.data;
};

export const getBusinessHoursSchedule = async (startDate = null) => {
	const params = startDate ? { start_date: startDate } : {};
	const response = await apiClient.get("business-hours/schedule/", { params });
	return response.data;
};

export const getTodayHours = async (date = null) => {
	const params = date ? { date } : {};
	const response = await apiClient.get("business-hours/today/", { params });
	return response.data;
};

export const checkBusinessHours = async (datetime, profileId = null) => {
	const data = { datetime };
	if (profileId) data.profile_id = profileId;
	
	const response = await apiClient.post("business-hours/check/", data);
	return response.data;
};

// === Admin: Business Hours Profiles ===

export const getBusinessHoursProfiles = async () => {
	const response = await apiClient.get("business-hours/admin/profiles/");
	return response.data;
};

export const createBusinessHoursProfile = async (profileData) => {
	const response = await apiClient.post("business-hours/admin/profiles/", profileData);
	return response.data;
};

export const updateBusinessHoursProfile = async (profileId, profileData) => {
	const response = await apiClient.patch(`business-hours/admin/profiles/${profileId}/`, profileData);
	return response.data;
};

export const deleteBusinessHoursProfile = async (profileId) => {
	await apiClient.delete(`business-hours/admin/profiles/${profileId}/`);
};

// === Admin: Regular Hours Management ===

export const getRegularHours = async (profileId = null) => {
	const params = profileId ? { profile_id: profileId } : {};
	const response = await apiClient.get("business-hours/admin/regular-hours/", { params });
	return response.data;
};

export const createRegularHours = async (hoursData) => {
	const response = await apiClient.post("business-hours/admin/regular-hours/", hoursData);
	return response.data;
};

export const updateRegularHours = async (regularHoursId, hoursData) => {
	const response = await apiClient.patch(`business-hours/admin/regular-hours/${regularHoursId}/`, hoursData);
	return response.data;
};

// === Admin: Time Slots Management ===

export const getTimeSlots = async (regularHoursId = null, profileId = null) => {
	const params = {};
	if (regularHoursId) params.regular_hours_id = regularHoursId;
	if (profileId) params.profile_id = profileId;
	
	const response = await apiClient.get("business-hours/admin/time-slots/", { params });
	return response.data;
};

export const createTimeSlot = async (timeSlotData) => {
	const response = await apiClient.post("business-hours/admin/time-slots/", timeSlotData);
	return response.data;
};

export const updateTimeSlot = async (timeSlotId, timeSlotData) => {
	const response = await apiClient.patch(`business-hours/admin/time-slots/${timeSlotId}/`, timeSlotData);
	return response.data;
};

export const deleteTimeSlot = async (timeSlotId) => {
	await apiClient.delete(`business-hours/admin/time-slots/${timeSlotId}/`);
};

// === Admin: Special Hours Management ===

export const getSpecialHours = async (profileId = null, startDate = null, endDate = null) => {
	const params = {};
	if (profileId) params.profile_id = profileId;
	if (startDate) params.start_date = startDate;
	if (endDate) params.end_date = endDate;
	
	const response = await apiClient.get("business-hours/admin/special-hours/", { params });
	return response.data;
};

export const createSpecialHours = async (specialHoursData) => {
	const response = await apiClient.post("business-hours/admin/special-hours/", specialHoursData);
	return response.data;
};

export const updateSpecialHours = async (specialHoursId, specialHoursData) => {
	const response = await apiClient.patch(`business-hours/admin/special-hours/${specialHoursId}/`, specialHoursData);
	return response.data;
};

export const deleteSpecialHours = async (specialHoursId) => {
	await apiClient.delete(`business-hours/admin/special-hours/${specialHoursId}/`);
};

// === Admin: Special Hours Time Slots ===

export const getSpecialHoursTimeSlots = async (specialHoursId) => {
	const response = await apiClient.get("business-hours/admin/special-time-slots/", {
		params: { special_hours_id: specialHoursId }
	});
	return response.data;
};

export const createSpecialHoursTimeSlot = async (timeSlotData) => {
	const response = await apiClient.post("business-hours/admin/special-time-slots/", timeSlotData);
	return response.data;
};

export const updateSpecialHoursTimeSlot = async (timeSlotId, timeSlotData) => {
	const response = await apiClient.patch(`business-hours/admin/special-time-slots/${timeSlotId}/`, timeSlotData);
	return response.data;
};

export const deleteSpecialHoursTimeSlot = async (timeSlotId) => {
	await apiClient.delete(`business-hours/admin/special-time-slots/${timeSlotId}/`);
};

// === Admin: Holidays Management ===

export const getHolidays = async (profileId = null) => {
	const params = profileId ? { profile_id: profileId } : {};
	const response = await apiClient.get("business-hours/admin/holidays/", { params });
	return response.data;
};

export const createHoliday = async (holidayData) => {
	const response = await apiClient.post("business-hours/admin/holidays/", holidayData);
	return response.data;
};

export const updateHoliday = async (holidayId, holidayData) => {
	const response = await apiClient.patch(`business-hours/admin/holidays/${holidayId}/`, holidayData);
	return response.data;
};

export const deleteHoliday = async (holidayId) => {
	await apiClient.delete(`business-hours/admin/holidays/${holidayId}/`);
};

// === Admin: Summary and Utilities ===

export const getBusinessHoursSummary = async (profileId = null) => {
	const url = profileId 
		? `business-hours/admin/summary/${profileId}/`
		: "business-hours/admin/summary/";
		
	const response = await apiClient.get(url);
	return response.data;
};

// === Utility Functions ===

/**
 * Helper to format time for API (ensures HH:MM format)
 */
export const formatTimeForAPI = (timeString) => {
	if (!timeString) return null;
	
	// If already in HH:MM format, return as is
	if (/^\d{2}:\d{2}$/.test(timeString)) {
		return timeString;
	}
	
	// If in HH:MM:SS format, truncate
	if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) {
		return timeString.substring(0, 5);
	}
	
	return timeString;
};

/**
 * Helper to parse API time response (handles both HH:MM and HH:MM:SS)
 */
export const parseTimeFromAPI = (timeString) => {
	if (!timeString) return '';
	
	// Return first 5 characters (HH:MM)
	return timeString.substring(0, 5);
};

/**
 * Get day name from day number (0 = Monday)
 */
export const getDayName = (dayNumber) => {
	const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
	return days[dayNumber] || '';
};

/**
 * Get short day name from day number (0 = Monday)
 */
export const getShortDayName = (dayNumber) => {
	const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	return days[dayNumber] || '';
};

/**
 * Default business hours profile structure
 */
export const createDefaultProfile = () => ({
	name: 'Main Store',
	timezone: 'America/New_York',
	is_active: true,
	is_default: true
});

/**
 * Default regular hours structure for a day
 */
export const createDefaultRegularHours = (dayOfWeek, profileId) => ({
	profile: profileId,
	day_of_week: dayOfWeek,
	is_closed: false
});

/**
 * Default time slot structure
 */
export const createDefaultTimeSlot = (regularHoursId) => ({
	regular_hours: regularHoursId,
	opening_time: '09:00',
	closing_time: '17:00',
	slot_type: 'regular'
});

/**
 * Validate time slot for overlaps and logical errors
 */
export const validateTimeSlot = (slot, existingSlots = []) => {
	const errors = [];
	
	// Basic validation
	if (!slot.opening_time || !slot.closing_time) {
		errors.push('Opening and closing times are required');
		return errors;
	}
	
	// Check for same opening and closing time
	if (slot.opening_time === slot.closing_time) {
		errors.push('Opening and closing times cannot be the same');
	}
	
	// Check for overlaps with existing slots
	for (const existing of existingSlots) {
		if (existing.id === slot.id) continue; // Skip self when editing
		
		if (slotsOverlap(slot, existing)) {
			errors.push(`Time slot overlaps with existing ${existing.slot_type} hours`);
		}
	}
	
	return errors;
};

/**
 * Check if two time slots overlap
 */
export const slotsOverlap = (slot1, slot2) => {
	const time1Start = timeStringToMinutes(slot1.opening_time);
	const time1End = timeStringToMinutes(slot1.closing_time);
	const time2Start = timeStringToMinutes(slot2.opening_time);
	const time2End = timeStringToMinutes(slot2.closing_time);
	
	// Handle overnight hours
	const slot1Overnight = time1End < time1Start;
	const slot2Overnight = time2End < time2Start;
	
	if (slot1Overnight && slot2Overnight) {
		return true; // Both overnight, they definitely overlap
	}
	
	if (slot1Overnight) {
		// Slot1 goes overnight, check if slot2 overlaps with either part
		return (time2Start <= time1End) || (time2End >= time1Start) ||
		       (time2Start >= time1Start) || (time2End <= time1End);
	}
	
	if (slot2Overnight) {
		// Slot2 goes overnight, check if slot1 overlaps with either part  
		return (time1Start <= time2End) || (time1End >= time2Start) ||
		       (time1Start >= time2Start) || (time1End <= time2End);
	}
	
	// Neither overnight, standard overlap check
	return (time1Start < time2End) && (time2Start < time1End);
};

/**
 * Convert time string (HH:MM) to minutes since midnight
 */
const timeStringToMinutes = (timeString) => {
	const [hours, minutes] = timeString.split(':').map(Number);
	return hours * 60 + minutes;
};