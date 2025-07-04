import React from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

const TermsOfService = () => {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="link"
					className="p-0 h-auto text-primary-green hover:text-accent-dark-green underline"
				>
					Terms of Service
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] bg-accent-light-beige">
				<DialogHeader>
					<DialogTitle>Terms of Service</DialogTitle>
					<DialogDescription>Last updated: [Date]</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
					<p>
						Please read these terms and conditions carefully before using Our
						Service.
					</p>

					<h2 className="font-bold mt-4">Interpretation and Definitions</h2>
					{/* ... Add your full terms content here ... */}
					<p>
						Welcome to Ajeen. These are the terms and conditions governing your
						access to and use of the Ajeen website and its associated
						sub-domains, sites, services, and tools.
					</p>

					<h2 className="font-bold mt-4">1. Acceptance of Terms</h2>
					<p>
						By using the Site, you hereby accept these terms and conditions and
						represent that you agree to comply with these terms and conditions.
						This User Agreement is deemed effective upon your use of the Site
						which signifies your acceptance of these terms.
					</p>

					<h2 className="font-bold mt-4">2. User Accounts</h2>
					<p>
						To access certain services, you may be required to create an
						account. You are responsible for maintaining the confidentiality of
						your account and password and for restricting access to your
						computer, and you agree to accept responsibility for all activities
						that occur under your account or password.
					</p>

					<p className="mt-4">
						[... Placeholder for the rest of your Terms of Service content ...]
					</p>
				</div>
				<DialogFooter>
					<DialogTrigger asChild>
						<Button type="button">Close</Button>
					</DialogTrigger>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export default TermsOfService;
