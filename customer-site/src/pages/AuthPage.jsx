import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Lock } from "lucide-react";

const AuthPage = () => {
	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-md w-full space-y-8">
				<div className="text-center">
					<div className="mx-auto h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
						<User className="h-6 w-6 text-green-600" />
					</div>
					<h2 className="mt-6 text-3xl font-bold text-gray-900">
						Welcome to Ajeen
					</h2>
					<p className="mt-2 text-sm text-gray-600">
						Sign in to your account or continue as guest
					</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Login / Register</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<div className="relative">
								<Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
								<Input
									id="email"
									type="email"
									placeholder="Enter your email"
									className="pl-10"
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<div className="relative">
								<Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
								<Input
									id="password"
									type="password"
									placeholder="Enter your password"
									className="pl-10"
								/>
							</div>
						</div>

						<div className="space-y-3">
							<Button className="w-full bg-green-600 hover:bg-green-700">
								Sign In
							</Button>
							<Button
								variant="outline"
								className="w-full"
							>
								Create Account
							</Button>
							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<div className="w-full border-t border-gray-300" />
								</div>
								<div className="relative flex justify-center text-sm">
									<span className="px-2 bg-white text-gray-500">Or</span>
								</div>
							</div>
							<Button
								variant="ghost"
								className="w-full"
							>
								Continue as Guest
							</Button>
						</div>

						<div className="text-center">
							<p className="text-sm text-gray-600">
								Authentication functionality will be implemented here
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default AuthPage;
