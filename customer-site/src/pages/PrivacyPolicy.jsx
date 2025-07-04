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

const PrivacyPolicy = () => {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="link"
					className="p-0 h-auto text-primary-green hover:text-accent-dark-green underline"
				>
					Privacy Policy
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] bg-accent-light-beige">
				<DialogHeader>
					<DialogTitle>Privacy Policy</DialogTitle>
					<DialogDescription>Last updated: [Date]</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
					<p>
						This Privacy Policy describes Our policies and procedures on the
						collection, use and disclosure of Your information when You use the
						Service and tells You about Your privacy rights and how the law
						protects You.
					</p>

					<h2 className="font-bold mt-4">1. Information We Collect</h2>
					<p>
						We may collect personal identification information from Users in a
						variety of ways, including, but not limited to, when Users visit our
						site, register on the site, place an order, and in connection with
						other activities, services, features or resources we make available
						on our Site.
					</p>

					<h2 className="font-bold mt-4">
						2. How We Use Collected Information
					</h2>
					<p>
						Ajeen may collect and use Users personal information for the
						following purposes: to improve customer service, to personalize user
						experience, to process payments, to send periodic emails.
					</p>

					<p className="mt-4">
						[... Placeholder for the rest of your Privacy Policy content ...]
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

export default PrivacyPolicy;
