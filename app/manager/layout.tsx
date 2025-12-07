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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
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

  // Get all user organizations
  const userOrganizations = useQuery(api.organizationMemberships.getUserOrganizations);

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
          <div className="flex flex-col gap-2 p-2">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2">
                <Image 
                  src="/smile.png" 
                  alt="Smile Logo" 
                  width={28} 
                  height={28}
                  className="object-contain"
                />
                <div className="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>
                <Image
                  src="/sad.png"
                  alt="Sad Logo"
                  width={28}
                  height={28}
                  className="object-contain dark:hidden"
                />
              </div>
              <h1 className="text-base font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                R u OK today?
              </h1>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-5 hide-scrollbar min-w-0 overflow-x-hidden">
          <SidebarGroup className="p-1.5 min-w-0">
            <SidebarGroupContent className="min-w-0">
              <SidebarMenu className="gap-0.5 min-w-0">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => router.push("/manager/view")}
                    isActive={pathname === "/manager/view"}
                    className="text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
                  >
                    <Eye className="size-4" />
                    <span>View Organization</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <ManagerLayoutNav pathname={pathname} router={router} userRole={userRole} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSeparator />
          <SidebarGroup className="p-1.5 min-w-0">
            <SidebarGroupLabel className="text-lg font-bold text-slate-900 dark:text-slate-100 px-2 py-5 tracking-tight">Your organisations</SidebarGroupLabel>
            <SidebarGroupContent className="min-w-0 pt-1">
              <UserOrganizationsList 
                organizations={userOrganizations} 
                router={router}
                selectedOrg={selectedOrg}
                setSelectedOrg={setSelectedOrg}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="flex justify-end items-center p-3">
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
            className="text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
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
            className="text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
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
          className="text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
        >
          <UserCog className="size-4" />
          <span>Account Settings</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </>
  );
}

function UserOrganizationsList({
  organizations,
  router,
  selectedOrg,
  setSelectedOrg,
}: {
  organizations: Array<{ _id: string; organisation: string; role: string }> | undefined;
  router: AppRouterInstance;
  selectedOrg: string | null;
  setSelectedOrg: (org: string | null) => void;
}) {
  if (!organizations || organizations.length === 0) {
    return null;
  }

  // Group organizations by role
  const ownerOrgs = organizations.filter((org) => org.role === "owner");
  const editorOrgs = organizations.filter((org) => org.role === "editor");
  const viewerOrgs = organizations.filter((org) => org.role === "viewer");

  const handleOrgClick = (orgName: string) => {
    localStorage.setItem("selectedOrganization", orgName);
    setSelectedOrg(orgName);
    // Dispatch a custom event to notify other components
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("organizationChanged"));
    }
    router.push("/manager/view");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      {ownerOrgs.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 px-2 py-1 uppercase tracking-wide">
            Owner
          </div>
          <SidebarMenu className="gap-0.5 min-w-0">
            {ownerOrgs.map((org) => (
              <SidebarMenuItem key={org._id} className="min-w-0">
                <SidebarMenuButton
                  onClick={() => handleOrgClick(org.organisation)}
                  isActive={selectedOrg === org.organisation}
                  className="w-full min-w-0 text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
                >
                  <Building2 className="size-4 shrink-0" />
                  <span className="truncate min-w-0">{org.organisation}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      )}
      {editorOrgs.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 px-2 py-1 uppercase tracking-wide">
            Editor
          </div>
          <SidebarMenu className="gap-0.5">
            {editorOrgs.map((org) => (
              <SidebarMenuItem key={org._id}>
                <SidebarMenuButton
                  onClick={() => handleOrgClick(org.organisation)}
                  isActive={selectedOrg === org.organisation}
                  className="w-full text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
                >
                  <Building2 className="size-4" />
                  <span className="truncate">{org.organisation}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      )}
      {viewerOrgs.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 px-2 py-1 uppercase tracking-wide">
            Viewer
          </div>
          <SidebarMenu className="gap-0.5">
            {viewerOrgs.map((org) => (
              <SidebarMenuItem key={org._id}>
                <SidebarMenuButton
                  onClick={() => handleOrgClick(org.organisation)}
                  isActive={selectedOrg === org.organisation}
                  className="w-full text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
                >
                  <Building2 className="size-4" />
                  <span className="truncate">{org.organisation}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      )}
    </div>
  );
}

function SignOutButtonSidebar() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <button
      onClick={() =>
        void signOut().then(() => {
          // Clear organization selection from localStorage
          localStorage.removeItem("selectedOrganization");
          router.push("/signin");
        })
      }
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
    >
      <LogOut className="size-4" />
      <span>Sign Out</span>
    </button>
  );
}
