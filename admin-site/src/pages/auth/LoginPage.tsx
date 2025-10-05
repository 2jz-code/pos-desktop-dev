import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Package, Eye, EyeOff, Loader2 } from "lucide-react";
import { TenantSelectorDialog } from "./TenantSelectorDialog";

const loginSchema = z.object({
	email: z
		.string()
		.min(1, "Email is required")
		.email("Please enter a valid email address"),
	password: z
		.string()
		.min(1, "Password is required")
		.min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface Tenant {
	tenant_id: string;
	tenant_name: string;
	tenant_slug: string;
	user_id: string;
	role: string;
}

export const LoginPage = () => {
	const { login, handleTenantSelection } = useAuth();
	const navigate = useNavigate();
	const [showPassword, setShowPassword] = useState(false);
	const [loginError, setLoginError] = useState<string | null>(null);
	const [tenants, setTenants] = useState<Tenant[]>([]);
	const [showTenantSelector, setShowTenantSelector] = useState(false);
	const [credentials, setCredentials] = useState<{
		email: string;
		password: string;
	} | null>(null);
	const [isTenantSelecting, setIsTenantSelecting] = useState(false);

	const form = useForm<LoginFormData>({
		resolver: zodResolver(loginSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	const onSubmit = async (data: LoginFormData) => {
		try {
			setLoginError(null);
			const result = await login(data.email, data.password);

			// Check if multiple tenants - show tenant selector
			if (result.multiple_tenants) {
				setTenants(result.tenants);
				setCredentials({ email: data.email, password: data.password });
				setShowTenantSelector(true);
				return;
			}

			// Single tenant - navigate to dashboard with tenant slug in path
			navigate(`/${result.tenant.slug}/dashboard`);
		} catch (error: any) {
			console.error("Login error:", error);

			// Handle different types of errors
			if (error.response?.status === 401) {
				setLoginError("Invalid email or password. Please try again.");
			} else if (error.response?.status === 403) {
				setLoginError(
					"Access denied. This account cannot access the admin panel."
				);
			} else if (error.response?.data?.error) {
				setLoginError(error.response.data.error);
			} else if (error.message) {
				setLoginError(error.message);
			} else {
				setLoginError("An unexpected error occurred. Please try again.");
			}
		}
	};

	const onTenantSelect = async (tenantId: string) => {
		if (!credentials) return;

		try {
			setIsTenantSelecting(true);
			setLoginError(null);

			const result = await handleTenantSelection(
				credentials.email,
				credentials.password,
				tenantId
			);

			// Success - navigate to dashboard with tenant slug in path
			navigate(`/${result.tenant.slug}/dashboard`);
		} catch (error: any) {
			console.error("Tenant selection error:", error);

			// Close dialog and show error
			setShowTenantSelector(false);
			setIsTenantSelecting(false);

			if (error.response?.data?.error) {
				setLoginError(error.response.data.error);
			} else if (error.message) {
				setLoginError(error.message);
			} else {
				setLoginError(
					"Failed to select tenant. Please try logging in again."
				);
			}
		}
	};

	const isLoading = form.formState.isSubmitting;

	return (
		<div className="min-h-screen flex items-center justify-center bg-background p-4">
			<div className="w-full max-w-md">
				<Card className="shadow-lg">
					<CardHeader className="text-center space-y-6">
						<div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
							<Package className="h-8 w-8 text-primary" />
						</div>
						<div>
							<CardTitle className="text-2xl font-bold">Ajeen Admin</CardTitle>
							<p className="text-muted-foreground mt-2">
								Sign in to your admin account
							</p>
						</div>
					</CardHeader>

					<CardContent className="space-y-6">
						{loginError && (
							<Alert variant="destructive">
								<AlertDescription>{loginError}</AlertDescription>
							</Alert>
						)}

						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="space-y-4"
							>
								<FormField
									control={form.control}
									name="email"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Email Address</FormLabel>
											<FormControl>
												<Input
													type="email"
													placeholder="Enter your email"
													disabled={isLoading}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Password</FormLabel>
											<FormControl>
												<div className="relative">
													<Input
														type={showPassword ? "text" : "password"}
														placeholder="Enter your password"
														disabled={isLoading}
														{...field}
													/>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
														onClick={() => setShowPassword(!showPassword)}
														disabled={isLoading}
													>
														{showPassword ? (
															<EyeOff className="h-4 w-4 text-muted-foreground" />
														) : (
															<Eye className="h-4 w-4 text-muted-foreground" />
														)}
													</Button>
												</div>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button
									type="submit"
									className="w-full"
									disabled={isLoading}
								>
									{isLoading ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Signing in...
										</>
									) : (
										"Sign In"
									)}
								</Button>
							</form>
						</Form>

						<div className="text-center text-sm text-muted-foreground">
							<p>Admin access only</p>
							<p className="mt-1">
								Need help? Contact your system administrator
							</p>
						</div>
					</CardContent>
				</Card>

				{/* Tenant Selector Dialog */}
				<TenantSelectorDialog
					open={showTenantSelector}
					tenants={tenants}
					onSelectTenant={onTenantSelect}
					isLoading={isTenantSelecting}
				/>
			</div>
		</div>
	);
};
