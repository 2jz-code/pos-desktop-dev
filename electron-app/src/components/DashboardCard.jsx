import { Link } from "react-router-dom";
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardDescription,
} from "@/components/ui/card";
import {
	Users,
	Package,
	ShoppingCart,
	BarChart,
	DollarSign,
	Tag,
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
			className="block hover:no-underline"
		>
			<Card className="h-full transition-all hover:shadow-md hover:-translate-y-1">
				<CardHeader>
					<div className="flex justify-between items-center">
						<CardTitle className="text-xl">{title}</CardTitle>
						{Icon && <Icon className="h-6 w-6 text-muted-foreground" />}
					</div>
				</CardHeader>
				<CardContent>
					<CardDescription>{description}</CardDescription>
				</CardContent>
			</Card>
		</Link>
	);
}
