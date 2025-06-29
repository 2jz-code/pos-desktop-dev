import { Link } from "react-router-dom";
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardDescription,
} from "@/shared/components/ui/card";
import {
	Users,
	Package,
	ShoppingCart,
	BarChart,
	DollarSign,
	Tag,
	ArrowRight,
} from "lucide-react";

const icons = {
	Users,
	Package,
	ShoppingCart,
	BarChart,
	DollarSign,
	Tag,
};

export function DashboardCard({ to, title, description, iconName }) {
	const Icon = icons[iconName];

	return (
		<Link
			to={to}
			className="block group"
		>
			<Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
				<CardHeader className="pb-4">
					<div className="flex items-start justify-between">
						<div className="flex items-center gap-3">
							<div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-colors">
								{Icon && (
									<Icon className="h-5 w-5 text-slate-700 dark:text-slate-300" />
								)}
							</div>
							<CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
								{title}
							</CardTitle>
						</div>
						<ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
					</div>
				</CardHeader>
				<CardContent className="pt-0">
					<CardDescription className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
						{description}
					</CardDescription>
				</CardContent>
			</Card>
		</Link>
	);
}
