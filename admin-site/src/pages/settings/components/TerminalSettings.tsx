import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardHeader,
	CardContent,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Monitor, ExternalLink } from "lucide-react";

export function TerminalSettings() {
	const { tenant } = useAuth();

	return (
		<div className="space-y-6">
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
							<Monitor className="h-4 w-4 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">Terminal Management</CardTitle>
							<CardDescription>
								Activate and manage POS terminals for your locations
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="rounded-lg border border-border/40 bg-muted/30 p-6">
						<div className="flex items-start justify-between gap-4">
							<div className="flex-1 space-y-2">
								<h3 className="font-semibold text-foreground flex items-center gap-2">
									<Monitor className="h-5 w-5 text-primary" />
									Activate New Terminal
								</h3>
								<p className="text-sm text-muted-foreground">
									Pair a new POS terminal to your organization by entering the activation code displayed on the terminal screen.
								</p>
								<ul className="text-sm text-muted-foreground space-y-1 ml-7 list-disc">
									<li>Secure RFC 8628 device authorization flow</li>
									<li>Assign terminals to specific store locations</li>
									<li>Set custom nicknames for easy identification</li>
								</ul>
							</div>
							<Link to={`/${tenant?.slug}/terminals/activate`}>
								<Button variant="default" className="shrink-0">
									<Monitor className="h-4 w-4 mr-2" />
									Activate Terminal
									<ExternalLink className="h-3 w-3 ml-2" />
								</Button>
							</Link>
						</div>
					</div>

					<div className="rounded-lg border border-border/40 bg-muted/10 p-4">
						<p className="text-sm text-muted-foreground">
							<strong className="text-foreground">Note:</strong> Terminal activation requires manager, admin, or owner permissions.
							The terminal will display a pairing code (e.g., ABCD-1234) which you'll enter on the activation page.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
