import { useQuery, useMutation, useQueryClient } from "react-query";
import * as settingsService from "../services/settingsService";
import { toast } from "react-hot-toast";
import terminalRegistrationService from "@/services/TerminalRegistrationService";

const useDeviceSettings = () => {
	const queryClient = useQueryClient();

	// Get device_id from terminal registration (from pairing flow)
	const terminalConfig = terminalRegistrationService.getTerminalConfig();
	const device_id = terminalConfig?.device_id || null;

	// Terminal must be paired before device settings can be configured
	const isTerminalPaired = terminalRegistrationService.isTerminalRegistered();

	// Query to fetch the current device settings from the backend
	const {
		data: deviceSettings,
		isLoading: isLoadingSettings,
		error: fetchError,
	} = useQuery(
		["deviceSettings", device_id],
		() => settingsService.getTerminalRegistration(device_id),
		{
			enabled: !!device_id && isTerminalPaired, // Only run if terminal is paired
			retry: (failureCount, error) => {
				// A 404 is not a true error here, it just means the device is new. Don't retry.
				if (error?.response?.status === 404) {
					return false;
				}
				return failureCount < 3;
			},
			// Prevent 404s from being thrown as a query error, as it's an expected state for new devices.
			throwOnError: (error) => error?.response?.status !== 404,
		}
	);

	// Mutation for creating or updating the device settings
	const {
		mutate: saveDeviceSettings,
		isLoading: isSaving,
		error: saveError,
	} = useMutation(
		(settingsDataFromForm) => {
			// This is the critical part. We combine the data from the form
			// with the constant device_id to create the full payload.
			const payload = {
				device_id: device_id,
				nickname: settingsDataFromForm.nickname,
				store_location: settingsDataFromForm.store_location,
				reader_id: settingsDataFromForm.reader_id || null, // Ensure reader_id is present, even if null
			};
			return settingsService.upsertTerminalRegistration(payload);
		},
		{
			onSuccess: () => {
				toast.success("Device settings saved successfully!");
				// After a successful save, invalidate the query to refetch the fresh data
				queryClient.invalidateQueries(["deviceSettings", device_id]);
			},
			onError: (error) => {
				const errorMessage =
					error.response?.data?.detail ||
					error.message ||
					"An unknown error occurred.";
				toast.error(`Failed to save settings: ${errorMessage}`);
			},
		}
	);

	return {
		device_id,
		// Provide default empty object to prevent destructuring errors in the component
		deviceSettings: deviceSettings || {},
		isLoadingSettings,
		// Only surface the error if it's not a 404
		fetchError: fetchError?.response?.status !== 404 ? fetchError : null,
		saveDeviceSettings,
		isSaving,
		saveError,
	};
};

export default useDeviceSettings;
