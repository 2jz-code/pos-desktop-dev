import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
	Monitor,
	WifiOff,
	RefreshCw,
	AlertTriangle,
	DollarSign,
	Plus,
	MapPin,
	ArrowUpRight,
	Search,
	Server,
	Activity,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import {
	getTerminalRegistrations,
	type TerminalRegistration,
} from "@/services/api/terminalService";

// --- Components ---

const StatusIndicator = ({ status }: { status: string }) => {
	const isOnline = status === "online";
	const isSyncing = status === "syncing";

	if (isSyncing) {
		return (
			<span className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800">
				<RefreshCw className="w-3 h-3 animate-spin" />
				Syncing
			</span>
		);
	}

	if (isOnline) {
		return (
			<span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
				<span className="relative flex h-2 w-2">
					<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
					<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
				</span>
				Online
			</span>
		);
	}

	return (
		<span className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2.5 py-1 rounded-full border border-rose-200 dark:border-rose-800">
			<WifiOff className="w-3 h-3" />
			Offline
		</span>
	);
};

const TerminalCard = ({ terminal }: { terminal: TerminalRegistration }) => {
	const offlineRev = parseFloat(terminal.daily_offline_revenue || "0");
	const hasOfflineRevenue = offlineRev > 0;

	return (
		<div className="group relative bg-card border border-border rounded-xl p-5 transition-all duration-200 hover:shadow-lg hover:border-primary/20 hover:-translate-y-1">
			{/* Header: Identity & Status */}
			<div className="flex justify-between items-start mb-4">
				<div>
					<div className="flex items-center gap-2 mb-1">
						<Monitor className="w-4 h-4 text-muted-foreground" />
						<h3 className="font-semibold text-foreground text-lg">
							{terminal.nickname || "Unknown Terminal"}
						</h3>
					</div>
					<p className="text-xs text-muted-foreground font-mono tracking-wide">
						ID: {terminal.device_id.slice(-8)}
					</p>
				</div>
				<StatusIndicator status={terminal.display_status} />
			</div>

			{/* Divider */}
			<div className="h-px w-full bg-border my-3" />

			{/* Metrics Grid */}
			<div className="grid grid-cols-2 gap-4">
				{/* Location */}
				<div className="space-y-1">
					<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
						<MapPin className="w-3 h-3" /> Location
					</span>
					<p className="text-sm font-medium text-foreground truncate">
						{terminal.location_name || "Unassigned"}
					</p>
				</div>

				{/* Last Seen */}
				<div className="space-y-1">
					<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
						<Activity className="w-3 h-3" /> Heartbeat
					</span>
					<p className="text-sm font-medium text-foreground">
						{terminal.last_heartbeat_at
							? formatDistanceToNow(new Date(terminal.last_heartbeat_at), {
									addSuffix: true,
							  })
							: "Never"}
					</p>
				</div>
			</div>

			{/* Offline Revenue Section - shows revenue processed while offline (already synced) */}
			<div
				className={`mt-5 rounded-lg p-3 border ${
					hasOfflineRevenue
						? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
						: "bg-muted border-border"
				}`}
			>
				<div className="flex justify-between items-center">
					<div className="flex flex-col">
						<span
							className={`text-[10px] uppercase font-bold tracking-wider ${
								hasOfflineRevenue ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
							}`}
						>
							Offline Revenue
						</span>
						<span className="text-xs text-muted-foreground">Synced today</span>
					</div>
					<div className="text-right">
						<span
							className={`text-xl font-bold ${
								hasOfflineRevenue ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
							}`}
						>
							${offlineRev.toFixed(2)}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
};

// --- Main Page ---

export function TerminalsPage() {
	const { tenant } = useAuth();
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [locationFilter, setLocationFilter] = useState("all");

	const {
		data: terminals = [],
		isLoading,
		error,
	} = useQuery({
		queryKey: ["terminals"],
		queryFn: getTerminalRegistrations,
		refetchInterval: 15000,
	});

	// Extract unique locations for filter
	const locations = useMemo(() => {
		const locationSet = new Map<number, string>();
		terminals.forEach((t) => {
			if (t.store_location && t.location_name) {
				locationSet.set(t.store_location, t.location_name);
			}
		});
		return Array.from(locationSet.entries()).map(([id, name]) => ({
			id,
			name,
		}));
	}, [terminals]);

	// Filtering Logic
	const filteredTerminals = useMemo(() => {
		return terminals.filter((t) => {
			const matchesSearch =
				t.nickname?.toLowerCase().includes(search.toLowerCase()) ||
				t.device_id.toLowerCase().includes(search.toLowerCase());

			const matchesStatus =
				statusFilter === "all" || t.display_status === statusFilter;

			const matchesLocation =
				locationFilter === "all" ||
				t.store_location === parseInt(locationFilter);

			return matchesSearch && matchesStatus && matchesLocation;
		});
	}, [terminals, search, statusFilter, locationFilter]);

	// Stats Calculation
	const stats = useMemo(() => {
		const offlineAmount = terminals.reduce(
			(acc, t) => acc + parseFloat(t.daily_offline_revenue || "0"),
			0
		);
		const offlineCount = terminals.filter(
			(t) => t.display_status === "offline"
		).length;
		return { offlineAmount, offlineCount };
	}, [terminals]);

	return (
		<DomainPageLayout
			pageTitle="Terminal Fleet"
			pageDescription="Manage hardware connections and sync status"
			pageIcon={Server}
			showSearch={false} // We implement custom search below
			pageActions={
				<Button
					onClick={() => navigate(`/${tenant?.slug}/terminals/activate`)}
				>
					<Plus className="h-4 w-4 mr-2" />
					Pair Terminal
				</Button>
			}
		>
			{/* 1. Context Banner: Financial Clarity */}
			<div className="mb-8 p-4 rounded-xl bg-muted border border-border shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
				<div className="flex items-center gap-4">
					<div className="p-3 bg-primary/10 rounded-lg">
						<DollarSign className="w-6 h-6 text-primary" />
					</div>
					<div>
						<h2 className="font-semibold text-lg text-foreground">Revenue Reporting</h2>
						<p className="text-muted-foreground text-sm">
							This page only displays{" "}
							<span className="text-amber-600 dark:text-amber-400 font-medium">
								offline/pending
							</span>{" "}
							revenue. For total sales and reports, view the Analytics
							dashboard.
						</p>
					</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="whitespace-nowrap group"
					onClick={() => navigate(`/${tenant?.slug}/reports`)}
				>
					View Sales Reports
					<ArrowUpRight className="ml-2 w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
				</Button>
			</div>

			{/* 2. Controls & Overview */}
			<div className="flex flex-col md:flex-row gap-4 justify-between items-end mb-6">
				<div className="flex flex-wrap gap-3 w-full md:w-auto">
					<div className="relative w-full md:w-[250px]">
						<Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search terminal name or ID..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-9"
						/>
					</div>
					<Select
						value={statusFilter}
						onValueChange={setStatusFilter}
					>
						<SelectTrigger className="w-[140px]">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Statuses</SelectItem>
							<SelectItem value="online">Online</SelectItem>
							<SelectItem value="offline">Offline</SelectItem>
							<SelectItem value="syncing">Syncing</SelectItem>
						</SelectContent>
					</Select>
					{locations.length > 0 && (
						<Select
							value={locationFilter}
							onValueChange={setLocationFilter}
						>
							<SelectTrigger className="w-[160px]">
								<SelectValue placeholder="Location" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Locations</SelectItem>
								{locations.map((loc) => (
									<SelectItem key={loc.id} value={loc.id.toString()}>
										{loc.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>

				{/* Mini Stats */}
				<div className="flex gap-4">
					{stats.offlineCount > 0 && (
						<div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 rounded-md border border-rose-200 dark:border-rose-800 text-sm font-medium animate-pulse">
							<WifiOff className="w-4 h-4" />
							{stats.offlineCount} Terminal{stats.offlineCount !== 1 ? "s" : ""}{" "}
							Offline
						</div>
					)}
					{stats.offlineAmount > 0 && (
						<div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 rounded-md border border-emerald-200 dark:border-emerald-800 text-sm font-medium">
							<DollarSign className="w-4 h-4" />${stats.offlineAmount.toFixed(2)} Offline Today
						</div>
					)}
				</div>
			</div>

			{/* 3. The Grid */}
			{isLoading ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-48 rounded-xl bg-muted animate-pulse"
						/>
					))}
				</div>
			) : filteredTerminals.length > 0 ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{filteredTerminals.map((terminal) => (
						<TerminalCard
							key={terminal.id}
							terminal={terminal}
						/>
					))}
				</div>
			) : (
				<div className="text-center py-20 bg-muted rounded-xl border-2 border-dashed border-border">
					<Monitor className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
					<h3 className="text-lg font-medium text-foreground">
						No Terminals Found
					</h3>
					<p className="text-muted-foreground">
						{search || statusFilter !== "all" || locationFilter !== "all"
							? "Try adjusting your filters"
							: "Pair your first terminal to get started"}
					</p>
				</div>
			)}
		</DomainPageLayout>
	);
}
