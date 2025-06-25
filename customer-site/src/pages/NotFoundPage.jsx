import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, ArrowLeft } from "lucide-react";

const NotFoundPage = () => {
	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
			<Card className="max-w-md w-full">
				<CardContent className="text-center py-12">
					<div className="text-6xl font-bold text-gray-300 mb-4">404</div>
					<h1 className="text-2xl font-bold text-gray-900 mb-2">
						Page Not Found
					</h1>
					<p className="text-gray-600 mb-8">
						Sorry, we couldn't find the page you're looking for.
					</p>

					<div className="space-y-3">
						<Button
							asChild
							className="w-full bg-green-600 hover:bg-green-700"
						>
							<Link
								to="/"
								className="flex items-center justify-center"
							>
								<Home className="mr-2 h-4 w-4" />
								Go Home
							</Link>
						</Button>
						<Button
							variant="outline"
							asChild
							className="w-full"
						>
							<Link
								to="/menu"
								className="flex items-center justify-center"
							>
								Browse Menu
							</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};

export default NotFoundPage;
