"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, usePathname } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Switch } from "@/components/ui/switch";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Eye, Edit, LogOut, Users, UserCog, Building2 } from "lucide-react";
import { api } from "../../convex/_generated/api";

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const pathname = usePathname();
  const user = useQuery(api.users.getCurrentUser);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);

  // Get selected organization from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const org = localStorage.getItem("selectedOrganization");
      setSelectedOrg(org);
      setIsLoadingOrg(false);
    }
  }, []);

  // Get user's role in selected organization
  const userRole = useQuery(
    api.users.getUserRoleInOrg,
    selectedOrg ? { organisation: selectedOrg } : "skip"
  );

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isLoading, router]);

  // Redirect to organization selection if no org selected (only after loading org from localStorage)
  useEffect(() => {
    if (!isLoading && !isLoadingOrg && isAuthenticated && !selectedOrg) {
      router.push("/select-organization");
    }
  }, [isLoading, isLoadingOrg, isAuthenticated, selectedOrg, router]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 w-full h-screen justify-center items-center px-4">
        <div className="flex items-center gap-6">
          <Image src="/smile.png" alt="Smile Logo" width={90} height={90} />
          <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image src="/sad.png" alt="Sad Logo" width={90} height={90} />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
          <div
            className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
            style={{ animationDelay: "0.1s" }}
          ></div>
          <div
            className="w-2 h-2 bg-slate-600 rounded-full animate-bounce"
            style={{ animationDelay: "0.2s" }}
          ></div>
          <p className="ml-2 text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-3 p-2">
            <Image src="/smile.png" alt="Smile Logo" width={32} height={32} />
            <div className="w-px h-8 bg-slate-300 dark:bg-slate-600"></div>
            <Image
              src="/sad.png"
              alt="Sad Logo"
              width={32}
              height={32}
              className="dark:hidden"
            />
          </div>
          <h1 className="font-semibold text-slate-800 dark:text-slate-200 px-2">
            R u OK today?
          </h1>
          <OrganizationSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => router.push("/manager/view")}
                    isActive={pathname === "/manager/view"}
                  >
                    <Eye className="size-4" />
                    <span>View Organization</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <ManagerLayoutNav pathname={pathname} router={router} userRole={userRole} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SignOutButtonSidebar />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <SidebarToggleButton />
        <main className="p-8 flex flex-col gap-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SidebarToggleButton() {
  const { open, toggleSidebar } = useSidebar();

  return (
    <div
      className={`fixed top-4 z-50 bg-sidebar border-t border-b border-sidebar-border h-12 px-3 flex items-center transition-all duration-300 ${
        open ? 'left-[240px] border-r rounded-r' : 'left-0 border-r rounded-r shadow-sm'
      }`}
    >
      <Switch
        checked={open}
        onCheckedChange={toggleSidebar}
        className="data-[state=checked]:bg-blue-300 data-[state=unchecked]:bg-slate-300 dark:data-[state=unchecked]:bg-slate-600"
      />
    </div>
  );
}

function ManagerLayoutNav({
  pathname,
  router,
  userRole
}: {
  pathname: string;
  router: AppRouterInstance;
  userRole: "owner" | "editor" | "viewer" | null | undefined;
}) {
  if (!userRole) return null;

  const canEdit = userRole === "owner" || userRole === "editor";
  const isOwner = userRole === "owner";

  return (
    <>
      {canEdit && (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => router.push("/manager/edit")}
            isActive={pathname === "/manager/edit"}
          >
            <Edit className="size-4" />
            <span>Edit Organization</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
      {isOwner && (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => router.push("/manager/managers")}
            isActive={pathname === "/manager/managers"}
          >
            <Users className="size-4" />
            <span>Viewer Access</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => router.push("/manager/account")}
          isActive={pathname === "/manager/account"}
        >
          <UserCog className="size-4" />
          <span>Account Settings</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </>
  );
}

function OrganizationSwitcher() {
  const router = useRouter();
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const org = localStorage.getItem("selectedOrganization");
      setSelectedOrg(org);
    }
  }, []);

  const displayName = selectedOrg || "No Organization";

  return (
    <div className="px-2 py-2">
      <button
        onClick={() => {
          // Clear selected organization and go to selection page
          localStorage.removeItem("selectedOrganization");
          router.push("/select-organization");
        }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm"
      >
        <Building2 className="size-4 text-slate-600 dark:text-slate-400" />
        <div className="flex-1 text-left">
          <div className="text-xs text-slate-500 dark:text-slate-400">Organization</div>
          <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
            {displayName}
          </div>
        </div>
      </button>
    </div>
  );
}

function SignOutButtonSidebar() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() =>
            void signOut().then(() => {
              // Clear organization selection from localStorage
              localStorage.removeItem("selectedOrganization");
              router.push("/signin");
            })
          }
        >
          <LogOut className="size-4" />
          <span>Sign Out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
