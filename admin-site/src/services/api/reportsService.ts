import apiClient from "./client";

interface Filters {
	[key: string]: unknown;
}

interface ReportConfig {
	report_type: string;
	start_date: string;
	end_date: string;
	filters: Filters;
}

interface BulkExportConfig {
	report_configs: ReportConfig[];
	export_format: string;
	compress: boolean;
	priority: number;
}

const reportsService = {
	// Generate reports
	generateSummaryReport: async (
		startDate: string,
		endDate: string,
		filters: Filters = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get("/reports/summary/", {
				params: {
					start_date: startDate,
					end_date: endDate,
					...filters,
				},
			});
			return response.data;
		} catch (error) {
			console.error("Error generating summary report:", error);
			throw error;
		}
	},

	generateSalesReport: async (
		startDate: string,
		endDate: string,
		groupBy: string = "day",
		filters: Filters = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get("/reports/sales/", {
				params: {
					start_date: startDate,
					end_date: endDate,
					group_by: groupBy,
					...filters,
				},
			});
			return response.data;
		} catch (error) {
			console.error("Error generating sales report:", error);
			throw error;
		}
	},

	generateProductsReport: async (
		startDate: string,
		endDate: string,
		filters: Filters = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get("/reports/products/", {
				params: {
					start_date: startDate,
					end_date: endDate,
					...filters,
				},
			});
			return response.data;
		} catch (error) {
			console.error("Error generating products report:", error);
			throw error;
		}
	},

	generatePaymentsReport: async (
		startDate: string,
		endDate: string,
		filters: Filters = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get("/reports/payments/", {
				params: {
					start_date: startDate,
					end_date: endDate,
					...filters,
				},
			});
			return response.data;
		} catch (error) {
			console.error("Error generating payments report:", error);
			throw error;
		}
	},

	generateOperationsReport: async (
		startDate: string,
		endDate: string,
		filters: Filters = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get("/reports/operations/", {
				params: {
					start_date: startDate,
					end_date: endDate,
					...filters,
				},
			});
			return response.data;
		} catch (error) {
			console.error("Error generating operations report:", error);
			throw error;
		}
	},

	getQuickMetrics: async (locationId?: number): Promise<unknown> => {
		try {
			const params: Record<string, unknown> = {};
			if (locationId) {
				params.location_id = locationId;
			}
			const response = await apiClient.get("/reports/quick-metrics/", { params });
			return response.data;
		} catch (error) {
			console.error("Error getting quick metrics:", error);
			throw error;
		}
	},

	// Generic report generation
	generateReport: async (
		reportType: string,
		startDate: string,
		endDate: string,
		filters: Filters = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get(`/reports/${reportType}/`, {
				params: {
					start_date: startDate,
					end_date: endDate,
					...filters,
				},
			});
			return response.data;
		} catch (error) {
			console.error(`Error generating ${reportType} report:`, error);
			throw error;
		}
	},

	// Background report generation
	generateReportAsync: async (
		reportType: string,
		startDate: string,
		endDate: string,
		filters: Filters = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.post("/reports/saved-reports/", {
				name: `Async ${reportType} report`,
				report_type: reportType,
				parameters: {
					start_date: startDate,
					end_date: endDate,
					filters,
				},
				schedule: "once",
			});
			return response.data;
		} catch (error) {
			console.error(`Error generating ${reportType} report async:`, error);
			throw error;
		}
	},

	// Get report execution status
	getReportExecution: async (executionId: string): Promise<unknown> => {
		try {
			const response = await apiClient.get(
				`/reports/executions/${executionId}/`
			);
			return response.data;
		} catch (error) {
			console.error("Error fetching report execution:", error);
			throw error;
		}
	},

	// List report executions
	listReportExecutions: async (
		params: Record<string, unknown> = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get("/reports/executions/", { params });
			return response.data;
		} catch (error) {
			console.error("Error listing report executions:", error);
			throw error;
		}
	},

	// Saved Reports Management
	listSavedReports: async (
		params: Record<string, unknown> = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get("/reports/saved-reports/", {
				params,
			});
			return response.data;
		} catch (error) {
			console.error("Error listing saved reports:", error);
			throw error;
		}
	},

	createSavedReport: async (reportData: unknown): Promise<unknown> => {
		try {
			const response = await apiClient.post(
				"/reports/saved-reports/",
				reportData
			);
			return response.data;
		} catch (error) {
			console.error("Error creating saved report:", error);
			throw error;
		}
	},

	updateSavedReport: async (
		reportId: string,
		reportData: unknown
	): Promise<unknown> => {
		try {
			const response = await apiClient.put(
				`/reports/saved-reports/${reportId}/`,
				reportData
			);
			return response.data;
		} catch (error) {
			console.error("Error updating saved report:", error);
			throw error;
		}
	},

	deleteSavedReport: async (reportId: string): Promise<unknown> => {
		try {
			const response = await apiClient.delete(
				`/reports/saved-reports/${reportId}/`
			);
			return response.data;
		} catch (error) {
			console.error("Error deleting saved report:", error);
			throw error;
		}
	},

	// Generate saved report
	generateSavedReport: async (reportId: string): Promise<unknown> => {
		try {
			const response = await apiClient.post(
				`/reports/saved-reports/${reportId}/run/`
			);
			return response.data;
		} catch (error) {
			console.error("Error generating saved report:", error);
			throw error;
		}
	},

	// Export saved report
	exportSavedReport: async (
		reportId: string,
		format: string = "xlsx"
	): Promise<unknown> => {
		try {
			const response = await apiClient.post(
				`/reports/saved-reports/${reportId}/export/`,
				{
					format,
				}
			);
			return response.data;
		} catch (error) {
			console.error("Error exporting saved report:", error);
			throw error;
		}
	},

	// Report Templates
	listReportTemplates: async (
		params: Record<string, unknown> = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get("/reports/templates/", { params });
			return response.data;
		} catch (error) {
			console.error("Error listing report templates:", error);
			throw error;
		}
	},

	createReportTemplate: async (templateData: unknown): Promise<unknown> => {
		try {
			const response = await apiClient.post(
				"/reports/templates/",
				templateData
			);
			return response.data;
		} catch (error) {
			console.error("Error creating report template:", error);
			throw error;
		}
	},

	updateReportTemplate: async (
		templateId: string,
		templateData: unknown
	): Promise<unknown> => {
		try {
			const response = await apiClient.put(
				`/reports/templates/${templateId}/`,
				templateData
			);
			return response.data;
		} catch (error) {
			console.error("Error updating report template:", error);
			throw error;
		}
	},

	deleteReportTemplate: async (templateId: string): Promise<unknown> => {
		try {
			const response = await apiClient.delete(
				`/reports/templates/${templateId}/`
			);
			return response.data;
		} catch (error) {
			console.error("Error deleting report template:", error);
			throw error;
		}
	},

	// Report Cache Management
	listReportCache: async (
		params: Record<string, unknown> = {}
	): Promise<unknown> => {
		try {
			const response = await apiClient.get("/reports/cache/", { params });
			return response.data;
		} catch (error) {
			console.error("Error listing report cache:", error);
			throw error;
		}
	},

	clearReportCache: async (cacheId: string): Promise<unknown> => {
		try {
			const response = await apiClient.delete(`/reports/cache/${cacheId}/`);
			return response.data;
		} catch (error) {
			console.error("Error clearing report cache:", error);
			throw error;
		}
	},

	// Bulk Export Operations
	createBulkExport: async (
		exportConfig: BulkExportConfig
	): Promise<unknown> => {
		try {
			const response = await apiClient.post(
				"/reports/bulk-export/create/",
				exportConfig
			);
			return response.data;
		} catch (error) {
			console.error("Error creating bulk export:", error);
			throw error;
		}
	},

	getBulkExportStatus: async (operationId: string): Promise<unknown> => {
		try {
			const response = await apiClient.get(
				`/reports/bulk-export/status/${operationId}/`
			);
			return response.data;
		} catch (error) {
			console.error("Error getting bulk export status:", error);
			throw error;
		}
	},

	getBulkExportQueueStatus: async (): Promise<unknown> => {
		try {
			const response = await apiClient.get(
				"/reports/bulk-export/queue-status/"
			);
			return response.data;
		} catch (error) {
			console.error("Error getting bulk export queue status:", error);
			throw error;
		}
	},

	processBulkExportQueue: async (): Promise<unknown> => {
		try {
			const response = await apiClient.post(
				"/reports/bulk-export/process-queue/"
			);
			return response.data;
		} catch (error) {
			console.error("Error processing bulk export queue:", error);
			throw error;
		}
	},

	// Utility functions - Send datetime strings that Django can parse correctly
	formatDateForApi: (date: Date | null): string | null => {
		if (!date) return null;
		// Format as local date + T00:00:00 (start of day)
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}T00:00:00`;
	},

	// Format end date to be inclusive (adds one day)
	formatEndDateForApi: (date: Date | null): string | null => {
		if (!date) return null;
		const nextDay = new Date(date);
		nextDay.setDate(date.getDate() + 1);
		// Format as local date + T00:00:00 (start of next day)
		const year = nextDay.getFullYear();
		const month = String(nextDay.getMonth() + 1).padStart(2, "0");
		const day = String(nextDay.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}T00:00:00`;
	},

	// Parse date string as local date (avoid UTC timezone issues)
	parseLocalDate: (dateString: string): Date => {
		// Parse YYYY-MM-DD format as local date instead of UTC
		const [year, month, day] = dateString.split("-").map(Number);
		return new Date(year, month - 1, day); // month is 0-indexed
	},

	// Download file helper
	downloadFile: async (url: string, filename: string): Promise<void> => {
		try {
			const response = await apiClient.get(url, {
				responseType: "blob",
			});

			const blob = new Blob([response.data]);
			const downloadUrl = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = downloadUrl;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(downloadUrl);
		} catch (error) {
			console.error("Error downloading file:", error);
			throw error;
		}
	},

	// Export individual report
	exportReport: async (
		reportType: string,
		startDate: string,
		endDate: string,
		format: string = "Excel",
		filters: Filters = {}
	): Promise<void> => {
		try {
			// Convert lowercase format to backend format
			const formatMap: { [key: string]: string } = {
				csv: "CSV",
				xlsx: "Excel",
				pdf: "PDF",
				// Also handle direct backend formats
				CSV: "CSV",
				Excel: "Excel",
				PDF: "PDF",
			};

			const backendFormat = formatMap[format] || "Excel";

			// Build parameters object as expected by backend
			const parameters = {
				start_date: startDate,
				end_date: endDate,
				...filters,
			};

			const response = await apiClient.post(
				"/reports/export/",
				{
					report_type: reportType,
					parameters: parameters,
					format: backendFormat,
				},
				{
					responseType: "blob",
				}
			);

			const blob = new Blob([response.data]);
			const downloadUrl = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = downloadUrl;

			// Use proper file extension
			const extensionMap: { [key: string]: string } = {
				CSV: "csv",
				Excel: "xlsx",
				PDF: "pdf",
			};
			const fileExtension = extensionMap[backendFormat] || "xlsx";

			link.download = `${reportType}-report-${startDate.split("T")[0]}-${
				endDate.split("T")[0]
			}.${fileExtension}`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(downloadUrl);
		} catch (error) {
			console.error("Error exporting report:", error);
			throw error;
		}
	},
};

export default reportsService;
