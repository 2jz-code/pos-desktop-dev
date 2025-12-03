import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/toaster";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Store,
	MapPin,
	FileText,
	Printer,
} from "lucide-react";

import { StoreLocationsManagement } from "./components/StoreLocationsManagement";
import { PrinterSettings } from "./components/PrinterSettings";
import { StockReasonSettings } from "./components/StockReasonSettings";
import { BrandInfoSettings } from "./components/BrandInfoSettings";

export function SettingsPage() {
	return (
		<>
			<Toaster />
			<div className="flex flex-col h-full">
				{/* Tabs Content - Full Height */}
				<div className="flex-1 overflow-hidden">
					<Tabs defaultValue="brand-info" className="h-full flex flex-col">
						{/* Tabs Navigation */}
						<div className="flex-shrink-0 border-b border-border bg-muted/20">
							<ScrollArea className="w-full">
								<TabsList className="inline-flex h-12 items-center justify-start w-full bg-transparent p-0 px-6">
									<TabsTrigger
										value="brand-info"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<Store className="h-4 w-4" />
										<span className="hidden sm:inline">Brand Info</span>
									</TabsTrigger>
									<TabsTrigger
										value="locations"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<MapPin className="h-4 w-4" />
										<span className="hidden sm:inline">Locations</span>
									</TabsTrigger>
									<TabsTrigger
										value="stock-reasons"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<FileText className="h-4 w-4" />
										<span className="hidden sm:inline">Stock Reasons</span>
									</TabsTrigger>
									<TabsTrigger
										value="printers"
										className="inline-flex items-center gap-2 px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
									>
										<Printer className="h-4 w-4" />
										<span className="hidden sm:inline">Printers</span>
									</TabsTrigger>
								</TabsList>
							</ScrollArea>
						</div>

						{/* Tab Content Panels */}
						<div className="flex-1 overflow-hidden">
							<ScrollArea className="h-full">
								<div className="p-6">
									<TabsContent value="brand-info" className="mt-0">
										<BrandInfoSettings />
									</TabsContent>

									<TabsContent value="locations" className="mt-0">
										<StoreLocationsManagement />
									</TabsContent>

									<TabsContent value="stock-reasons" className="mt-0">
										<StockReasonSettings />
									</TabsContent>

									<TabsContent value="printers" className="mt-0">
										<PrinterSettings />
									</TabsContent>
								</div>
							</ScrollArea>
						</div>
					</Tabs>
				</div>
			</div>
		</>
	);
}
