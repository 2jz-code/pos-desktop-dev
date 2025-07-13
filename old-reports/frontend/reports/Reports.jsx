// src/pages/reports/Reports.jsx
import { useState, useEffect, useCallback } from "react";
import { reportService } from "../../api/services/reportService";
import ReportDashboard from "./components/ReportDashboard";
import SalesReportForm from "./components/SalesReportForm";
import ProductReportForm from "./components/ProductReportForm";
import PaymentReportForm from "./components/PaymentReportForm";
import OperationalReportForm from "./components/OperationalReportForm";
import SavedReportsList from "./components/SavedReportsList";
import ReportViewer from "./components/ReportViewer";
import {
	ChartBarIcon as PageIcon, // Renamed for page title
	// Bars3Icon, // Handled by MainLayout
	DocumentChartBarIcon, // Sales
	ArchiveBoxIcon, // Products
	CreditCardIcon, // Payments
	CogIcon, // Operational
	BookmarkSquareIcon, // Saved
	ExclamationTriangleIcon,
	ArrowPathIcon,
	HomeIcon, // Dashboard Icon for tabs
} from "@heroicons/react/24/outline";
import { toast } from "react-toastify";
import MainLayout from "../layout/MainLayout";

const Reports = () => {
	const [activeTab, setActiveTab] = useState("dashboard");
	const [dashboardData, setDashboardData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [reportData, setReportData] = useState(null);
	const [reportType, setReportType] = useState(null);
	const [savedReports, setSavedReports] = useState([]);

	const fetchDashboardData = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const data = await reportService.getDashboardSummary();
			setDashboardData(data);
		} catch (err) {
			console.error("Error fetching dashboard data:", err);
			setError("Failed to load dashboard data. Please try again.");
		} finally {
			setIsLoading(false);
		}
	}, []);

	const fetchSavedReports = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const data = await reportService.getSavedReports();
			setSavedReports(data);
		} catch (err) {
			console.error("Error fetching saved reports:", err);
			setError("Failed to load saved reports. Please try again.");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		setReportData(null);
		setReportType(null);
		setError(null);
		if (activeTab === "dashboard") fetchDashboardData();
		else if (activeTab === "saved") fetchSavedReports();
		else setIsLoading(false);
	}, [activeTab, fetchDashboardData, fetchSavedReports]);

	const handleFormSubmit = async (formType, submitFunc, formData) => {
		setIsLoading(true);
		setError(null);
		try {
			const data = await submitFunc(formData);
			setReportData(data);
			setReportType(formType);
		} catch (err) {
			console.error(`Error generating ${formType} report:`, err);
			setError(`Failed to generate ${formType} report. Please try again.`);
			setReportData(null);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSalesReportSubmit = (formData) =>
		handleFormSubmit("sales", reportService.generateSalesReport, formData);
	const handleProductReportSubmit = (formData) =>
		handleFormSubmit("product", reportService.generateProductReport, formData);
	const handlePaymentReportSubmit = (formData) =>
		handleFormSubmit("payment", reportService.generatePaymentReport, formData);
	const handleOperationalReportSubmit = (formData) =>
		handleFormSubmit(
			"operational",
			reportService.generateOperationalInsights,
			formData
		);

	const handleSavedReportClick = async (reportId) => {
		setIsLoading(true);
		setError(null);
		try {
			const data = await reportService.getSavedReport(reportId);
			if (!data.result_data)
				throw new Error("Saved report data is missing or invalid.");
			setReportData(data.result_data);
			const reportTypeMapping = {
				daily_sales: "sales",
				weekly_sales: "sales",
				monthly_sales: "sales",
				product_performance: "product",
				payment_analytics: "payment",
				operational_insights: "operational",
			};
			setReportType(reportTypeMapping[data.report_type] || data.report_type);
		} catch (err) {
			console.error("Error loading saved report:", err);
			setError("Failed to load saved report. Please check data or try again.");
			setReportData(null);
			setReportType(null);
		} finally {
			setIsLoading(false);
		}
	};

	const handleDeleteSavedReport = async (reportId) => {
		if (!window.confirm("Are you sure you want to delete this saved report?"))
			return;
		try {
			await reportService.deleteSavedReport(reportId);
			toast.success("Report deleted successfully.");
			setSavedReports((prev) =>
				prev.filter((report) => report.id !== reportId)
			);
		} catch (err) {
			console.error("Error deleting saved report:", err);
			setError("Failed to delete saved report. Please try again.");
			toast.error("Failed to delete report.");
		}
	};

	const clearReportData = () => {
		setReportData(null);
		setReportType(null);
		setError(null);
		const formTabs = ["sales", "products", "payments", "operational"];
		if (!formTabs.includes(activeTab)) setActiveTab("dashboard");
	};

	const renderContent = () => {
		if (reportData && reportType) {
			// Ensure reportType is also set
			return (
				<ReportViewer
					data={reportData}
					type={reportType}
					onBack={clearReportData}
				/>
			);
		}
		switch (activeTab) {
			case "dashboard":
				return (
					<ReportDashboard
						data={dashboardData}
						isLoading={isLoading}
						error={error}
					/>
				);
			case "sales":
				return (
					<SalesReportForm
						onSubmit={handleSalesReportSubmit}
						isLoading={isLoading}
					/>
				);
			case "products":
				return (
					<ProductReportForm
						onSubmit={handleProductReportSubmit}
						isLoading={isLoading}
					/>
				);
			case "payments":
				return (
					<PaymentReportForm
						onSubmit={handlePaymentReportSubmit}
						isLoading={isLoading}
					/>
				);
			case "operational":
				return (
					<OperationalReportForm
						onSubmit={handleOperationalReportSubmit}
						isLoading={isLoading}
					/>
				);
			case "saved":
				return (
					<SavedReportsList
						reports={savedReports}
						isLoading={isLoading}
						error={error}
						onReportClick={handleSavedReportClick}
						onDeleteReport={handleDeleteSavedReport}
					/>
				);
			default:
				return (
					<div className="p-6 text-center text-slate-500">
						Select a report type.
					</div>
				);
		}
	};

	const tabs = [
		{ id: "dashboard", label: "Dashboard", icon: HomeIcon },
		{ id: "sales", label: "Sales", icon: DocumentChartBarIcon },
		{ id: "products", label: "Products", icon: ArchiveBoxIcon },
		{ id: "payments", label: "Payments", icon: CreditCardIcon },
		{ id: "operational", label: "Operational", icon: CogIcon },
		{ id: "saved", label: "Saved Reports", icon: BookmarkSquareIcon },
	];

	return (
		<MainLayout pageTitle="Reports & Analytics">
			{/* Page-specific header: Title is handled by MainLayout, Dashboard button by MainLayout's sidebar */}
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
				<h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
					<PageIcon className="h-6 w-6 text-slate-600" />
					Reporting Suite
				</h2>
				{/* Any page-specific action buttons could go here */}
			</div>

			{/* Tabs */}
			<div className="flex items-center flex-wrap gap-1 mb-4 bg-white p-1.5 rounded-lg shadow-sm border border-slate-200 overflow-x-auto custom-scrollbar flex-shrink-0">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						className={`flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
							activeTab === tab.id
								? "bg-black text-white shadow-sm"
								: "bg-white text-slate-600 hover:bg-slate-100"
						}`}
						onClick={() => setActiveTab(tab.id)}
					>
						<tab.icon className="h-4 w-4" />
						{tab.label}
					</button>
				))}
			</div>

			{/* Main Content Area */}
			<div className="flex-1 overflow-hidden bg-white rounded-lg shadow-sm border border-slate-200 min-h-0">
				{error && !isLoading && !reportData && (
					<div className="p-4 bg-red-50 text-red-700 border-b border-red-200 flex items-center gap-2 text-sm">
						<ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
						<span>{error}</span>
						{(activeTab === "dashboard" || activeTab === "saved") && (
							<button
								onClick={
									activeTab === "dashboard"
										? fetchDashboardData
										: fetchSavedReports
								}
								className="ml-auto text-xs font-medium text-red-800 hover:underline"
							>
								<ArrowPathIcon className="h-3 w-3 inline mr-1" /> Retry
							</button>
						)}
					</div>
				)}
				{/* Content itself will manage its internal scrolling if needed */}
				<div className="h-full overflow-y-auto custom-scrollbar">
					{renderContent()}
				</div>
			</div>
		</MainLayout>
	);
};

Reports.propTypes = {
	// No direct props expected for this page component when used with React Router
};

export default Reports;
