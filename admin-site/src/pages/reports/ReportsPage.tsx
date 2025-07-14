"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DualDatePicker } from "@/components/ui/dual-date-picker";
import {
	BarChart3,
	DollarSign,
	Package,
	CreditCard,
	Settings,
	BookOpen,
} from "lucide-react";
import { addDays } from "date-fns";

import { SummaryTab } from "./components/SummaryTab";
import { SalesTab } from "./components/SalesTab";
import { PaymentsTab } from "./components/PaymentsTab";
import { ProductsTab } from "./components/ProductsTab";
import { OperationsTab } from "./components/OperationsTab";
import { SavedReportsTab } from "./components/SavedReportsTab";

export default function ReportsPage() {
	const [activeTab, setActiveTab] = useState("dashboard");
	const [startDate, setStartDate] = useState<Date | undefined>(addDays(new Date(), -30));
	const [endDate, setEndDate] = useState<Date | undefined>(new Date());

	// Create a DateRange object for compatibility with existing tab components
	const dateRange = startDate && endDate ? { from: startDate, to: endDate } : undefined;

	return (
		<div className="flex-1 flex flex-col h-full overflow-hidden">
			<div className="flex-shrink-0 p-4 md:p-8 pt-6 pb-4">
				<div className="flex items-center justify-between space-y-2">
					<h2 className="text-3xl font-bold tracking-tight">Reports Dashboard</h2>
					<DualDatePicker
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
					/>
				</div>
			</div>

			<div className="flex-1 overflow-hidden px-4 md:px-8">
				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="h-full flex flex-col"
				>
					<TabsList className="grid w-full grid-cols-6 flex-shrink-0">
						<TabsTrigger
							value="dashboard"
							className="flex items-center gap-2"
						>
							<BarChart3 className="h-4 w-4" />
							<span className="hidden sm:inline">Dashboard</span>
						</TabsTrigger>
						<TabsTrigger
							value="sales"
							className="flex items-center gap-2"
						>
							<DollarSign className="h-4 w-4" />
							<span className="hidden sm:inline">Sales</span>
						</TabsTrigger>
						<TabsTrigger
							value="payments"
							className="flex items-center gap-2"
						>
							<CreditCard className="h-4 w-4" />
							<span className="hidden sm:inline">Payments</span>
						</TabsTrigger>
						<TabsTrigger
							value="products"
							className="flex items-center gap-2"
						>
							<Package className="h-4 w-4" />
							<span className="hidden sm:inline">Products</span>
						</TabsTrigger>
						<TabsTrigger
							value="operations"
							className="flex items-center gap-2"
						>
							<Settings className="h-4 w-4" />
							<span className="hidden sm:inline">Operations</span>
						</TabsTrigger>
						<TabsTrigger
							value="saved"
							className="flex items-center gap-2"
						>
							<BookOpen className="h-4 w-4" />
							<span className="hidden sm:inline">Saved</span>
						</TabsTrigger>
					</TabsList>

					<TabsContent
						value="dashboard"
						className="flex-1 overflow-y-auto mt-4"
					>
						<SummaryTab dateRange={dateRange} />
					</TabsContent>

					<TabsContent
						value="sales"
						className="flex-1 overflow-y-auto mt-4"
					>
						<SalesTab dateRange={dateRange} />
					</TabsContent>

					<TabsContent
						value="payments"
						className="flex-1 overflow-y-auto mt-4"
					>
						<PaymentsTab dateRange={dateRange} />
					</TabsContent>

					<TabsContent
						value="products"
						className="flex-1 overflow-y-auto mt-4"
					>
						<ProductsTab dateRange={dateRange} />
					</TabsContent>

					<TabsContent
						value="operations"
						className="flex-1 overflow-y-auto mt-4"
					>
						<OperationsTab dateRange={dateRange} />
					</TabsContent>

					<TabsContent
						value="saved"
						className="flex-1 overflow-y-auto mt-4"
					>
						<SavedReportsTab />
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
